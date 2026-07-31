"""
scoring.py
----------
Four-component hybrid scoring (no LLM, no external API):

  1. Dense   (40%) — all-MiniLM-L6-v2 cosine similarity (Sentence-BERT).
  2. BM25    (25%) — sentence-level corpus BM25 (fixes IDF=0 bug in 2-doc setup).
  3. TF-IDF  (15%) — sklearn cosine on original text with bigrams.
  4. Keyword (20%) — taxonomy PhraseMatcher + fuzzy + synonym coverage.

Root cause of BM25=0: with only 2 documents, any token appearing in both
gets IDF = log((2-2+0.5)/(2+0.5)+1) ≈ 0.18 but multiplied by TF gives near-zero.
Fix: split resume + JD into sentences -> many documents -> meaningful IDF.
"""

import datetime
import re
from typing import Any, List, Set, Tuple, Optional
from app.models.schemas import DetailedResumeAnalysis, SkillWithContext, JobRole, ResumeQuality, SectionAnalysis

import numpy as np
from rank_bm25 import BM25Okapi
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity

from app.core import config
from app.core.caching import get_content_hash, get_bm25_from_cache, set_bm25_in_cache
from app.core.lsa_similarity import lsa_score
from app.core.nlp_utils import (
    build_resume_skill_set,
    normalise,
    skill_in_resume,
    skill_keys_match,
)

W_DENSE               = 0.15
W_BM25                = 0.05
W_TFIDF               = 0.00  # Diagnostic only; BM25 already covers lexical relevance
W_KEYWORD             = 0.50
W_POSITIONAL_SKILL    = 0.15
W_EXPERIENCE_SKILL    = 0.15
W_RESUME_QUALITY      = 0.00  # Reported separately; never part of role alignment

# Ensure weights sum to 1.0 for proper normalization
_TOTAL_WEIGHT = W_DENSE + W_BM25 + W_TFIDF + W_KEYWORD + W_POSITIONAL_SKILL + W_EXPERIENCE_SKILL + W_RESUME_QUALITY
if abs(_TOTAL_WEIGHT - 1.0) > 1e-6:
    raise ValueError(f"Scoring weights do not sum to 1.0. Current sum: {_TOTAL_WEIGHT}")


def _cosine_dense(resume_emb: np.ndarray, jd_emb: np.ndarray) -> float:
    norm_r = np.linalg.norm(resume_emb)
    norm_j = np.linalg.norm(jd_emb)
    if norm_r == 0 or norm_j == 0:
        return 0.0
    raw = float(np.dot(resume_emb, jd_emb) / (norm_r * norm_j))
    # Negative similarity means no alignment. Remapping [-1, 1] to [0, 1]
    # gave unrelated/opposite text an artificial score of up to 50%.
    return float(np.clip(raw, 0.0, 1.0))


def _tokenize_for_bm25(text: str) -> List[str]:
    return re.sub(r"[^\w\s/#+.-]", " ", text.lower()).split()


def _split_sentences(text: str) -> List[List[str]]:
    """Split text into sentence-token-lists for BM25 corpus."""
    sentences = re.split(r"[.\n|•]+", text)
    result = []
    for s in sentences:
        tokens = _tokenize_for_bm25(s)
        if len(tokens) >= 3:
            result.append(tokens)
    return result


def _bm25_score(original_resume: str, original_jd: str) -> float:
    """
    Sentence-level BM25: corpus = all sentences from resume + JD.
    With N≥8 sentences, IDF is meaningful and scores are non-zero.
    Resume aggregate score normalised by JD self-score → [0,1].
    """
    resume_sents = _split_sentences(original_resume)
    jd_sents     = _split_sentences(original_jd)

    if not resume_sents or not jd_sents:
        return 0.0

    # BUG FIX: previously hashed only the first 80 chars of each text, so
    # any two (resume, JD) pairs sharing an opening (a common cover-page
    # template, a boilerplate JD header, etc.) would collide and silently
    # serve another pair's cached BM25 corpus/scores. Hash full content of
    # each side independently, so only byte-identical texts can ever hit
    # the same cache entry.
    corpus_key = get_content_hash(original_resume) + "_" + get_content_hash(original_jd)
    corpus_data = get_bm25_from_cache(corpus_key)

    if corpus_data is None:
        corpus = resume_sents + jd_sents
        bm25 = BM25Okapi(corpus)
        corpus_data = (bm25, len(resume_sents))
        set_bm25_in_cache(corpus_key, corpus_data)

    bm25, n_resume = corpus_data
    jd_query = _tokenize_for_bm25(original_jd)
    scores   = bm25.get_scores(jd_query)

    resume_score  = float(np.sum(scores[:n_resume]))
    jd_self_score = float(np.sum(scores[n_resume:]))

    if jd_self_score <= 0:
        return 0.0
    return float(np.clip(resume_score / jd_self_score, 0.0, 1.0))


def _tfidf_score(resume_text: str, jd_text: str) -> float:
    """TF-IDF cosine on original texts — preserves tech acronyms and compound terms."""
    # Use char-level n-grams too so 'AWS' != 'azure' etc are differentiated
    try:
        vec = TfidfVectorizer(
            stop_words="english",
            ngram_range=(1, 2),
            analyzer="word",
            min_df=1,
            sublinear_tf=True,
        )
        m = vec.fit_transform([resume_text, jd_text])
        return float(cosine_similarity(m[0:1], m[1:2])[0][0])
    except ValueError:
        return 0.0


def _keyword_units(jd_keywords: List[dict]) -> List[dict[str, Any]]:
    """Collapse explicit OR alternatives into one independently scored unit."""
    grouped: dict[str, dict[str, Any]] = {}
    for keyword in jd_keywords:
        unit_id = keyword.get("alternative_group") or f"skill:{keyword['key']}"
        unit = grouped.setdefault(
            unit_id,
            {
                "keys": [],
                "displays": [],
                "weight": 0.0,
                "requirement_level": "other",
            },
        )
        unit["keys"].append(normalise(keyword["key"]))
        unit["displays"].append(keyword.get("display", keyword["key"]))
        weighted_importance = float(keyword.get("score", 1.0)) * float(
            keyword.get("importance_multiplier", 1.0)
        )
        unit["weight"] = max(unit["weight"], weighted_importance)
        level = keyword.get("requirement_level", "other")
        level_priority = {"preferred": 0, "other": 1, "responsibility": 2, "required": 3}
        if level_priority.get(level, 1) > level_priority.get(
            unit["requirement_level"], 1
        ):
            unit["requirement_level"] = level
    return list(grouped.values())


def _positional_skill_score(
    jd_keywords: List[dict],
    detailed_resume_analysis: DetailedResumeAnalysis,
) -> float:
    """
    Scores skills based on their presence in high-value sections of the resume.
    Higher weight for skills in Summary, Skills section, or recent experience.
    """
    if not jd_keywords: return 1.0

    units = _keyword_units(jd_keywords)
    total_jd_weight = sum(unit["weight"] for unit in units)
    if total_jd_weight == 0: return 0.0

    matched_positional_weight = 0.0
    resume_skills_with_context = detailed_resume_analysis.all_extracted_skills

    for unit in units:
        best_position_bonus = 0.0
        for res_skill_ctx in resume_skills_with_context:
            if any(
                skill_keys_match(required_key, res_skill_ctx.skill)
                for required_key in unit["keys"]
            ):
                # Assign positional bonus
                position_bonus = 0.35
                if res_skill_ctx.section == "summary":
                    position_bonus = 0.5
                elif res_skill_ctx.section == "skills":
                    position_bonus = 0.65
                elif res_skill_ctx.section == "experience" and res_skill_ctx.end_year and res_skill_ctx.end_year >= datetime.datetime.now().year - 2:
                    position_bonus = 1.0
                elif res_skill_ctx.section == "experience":
                    position_bonus = 0.85
                elif res_skill_ctx.section == "projects":
                    position_bonus = 0.9
                elif res_skill_ctx.section == "certifications":
                    position_bonus = 0.6
                elif res_skill_ctx.section == "education":
                    position_bonus = 0.55
                best_position_bonus = max(best_position_bonus, position_bonus)
        matched_positional_weight += unit["weight"] * best_position_bonus

    # Normalize by total possible JD keyword weight, clipped to 1.0
    score = min(1.0, matched_positional_weight / total_jd_weight) if total_jd_weight > 0 else 0.0
    return score

def _experience_skill_score(
    jd_keywords: List[dict],
    detailed_resume_analysis: DetailedResumeAnalysis,
    required_years: Optional[float] = None,
    fresher_role: bool = False,
) -> float:
    """
    Scores skills based on the estimated duration of their usage in the resume.
    This is a heuristic to reward deeper experience with key skills.
    """
    if not jd_keywords: return 1.0

    units = _keyword_units(jd_keywords)
    total_jd_weight = sum(unit["weight"] for unit in units)
    if total_jd_weight == 0: return 0.0

    matched_experience_weight = 0.0
    resume_skills_with_context = detailed_resume_analysis.all_extracted_skills

    if fresher_role or (required_years is not None and required_years <= 1):
        target_months = 6.0
        project_credit = 0.7
        foundational_credit = 0.3
        learning_credit = 0.4
    elif required_years is not None:
        target_months = min(60.0, max(12.0, required_years * 12.0))
        project_credit = 0.0
        foundational_credit = 0.0
        learning_credit = 0.0
    else:
        target_months = 60.0
        project_credit = 0.0
        foundational_credit = 0.0
        learning_credit = 0.0

    for unit in units:
        best_evidence = 0.0
        for res_skill_ctx in resume_skills_with_context:
            if not any(
                skill_keys_match(required_key, res_skill_ctx.skill)
                for required_key in unit["keys"]
            ):
                continue
            if res_skill_ctx.duration_months is not None:
                best_evidence = max(
                    best_evidence,
                    min(1.0, res_skill_ctx.duration_months / target_months),
                )
            elif res_skill_ctx.section == "projects":
                # Projects are valid evidence for explicitly entry-level roles,
                # but never fabricate professional duration from them.
                best_evidence = max(best_evidence, project_credit)
            elif res_skill_ctx.section in {"education", "certifications"}:
                best_evidence = max(best_evidence, learning_credit)
            elif res_skill_ctx.section in {"skills", "summary"}:
                # A declaration is weak but relevant evidence for a role that
                # explicitly accepts freshers. It never receives professional
                # duration credit and is worth less than project evidence.
                best_evidence = max(best_evidence, foundational_credit)
        matched_experience_weight += unit["weight"] * best_evidence

    score = min(1.0, matched_experience_weight / total_jd_weight) if total_jd_weight > 0 else 0.0
    return score

def _resume_quality_score(resume_quality: ResumeQuality, section_analysis: SectionAnalysis) -> float:
    """
    Combines the existing resume quality score with section completeness.
    """
    quality_component = resume_quality.quality_score / 100.0 # Normalize to 0-1
    completeness_component = section_analysis.completeness_score / 100.0 # Normalize to 0-1
    
    # Simple average for now, can be weighted further if needed
    return (quality_component + completeness_component) / 2.0


def _overall_experience_fit_score(
    candidate_years: float,
    required_years: Optional[float],
    fresher_role: bool,
) -> Optional[float]:
    """
    Compare total dated experience only when the JD states an overall target.

    A general "0-1 years / freshers" requirement is satisfied by an entry-level
    candidate and must not require every individual tool to have six months of
    professional usage. Skill-specific tenure is a different requirement and
    should only be assessed when a JD explicitly states it.
    """
    if fresher_role and (required_years is None or required_years <= 0):
        return 1.0
    if required_years is None:
        return None
    if required_years <= 0:
        return 1.0
    return min(1.0, max(0.0, candidate_years) / required_years)

def _keyword_score(
    jd_keywords: List[dict],
    resume_lower: str,
    taxonomy_keys: Set[str],
    token_set: Set[str],
) -> Tuple[float, List[str], List[str]]:
    """
    Importance-weighted keyword coverage.

    Previously this was a flat `len(matched) / len(total)` ratio, which
    treats a skill mentioned once in passing exactly the same as a skill
    the JD repeats five times or lists under "Requirements". extract_jd_
    keywords() already computes a per-skill importance `score` (taxonomy
    hit + frequency bonus + section-header bonus) — we now use that as the
    weight, so covering the JD's *most emphasized* skills moves the needle
    more than covering minor/incidental ones. Falls back to a flat ratio
    only if every keyword's weight is somehow zero (degenerate input).
    """
    if not jd_keywords:
        return 1.0, [], []
    matched, missing = [], []
    matched_weight = 0.0
    total_weight = 0.0
    for unit in _keyword_units(jd_keywords):
        weight = max(float(unit["weight"]), 0.0) or 1.0
        total_weight += weight
        matched_members = [
            display
            for key, display in zip(unit["keys"], unit["displays"])
            if skill_in_resume(key, resume_lower, taxonomy_keys, token_set)
        ]
        if matched_members:
            matched.extend(matched_members)
            matched_weight += weight
        else:
            missing.append(" / ".join(unit["displays"]))
    coverage = (matched_weight / total_weight) if total_weight > 0 else (len(matched) / len(jd_keywords))
    return coverage, matched, missing


def calculate_match_score(
    cleaned_resume: str,
    cleaned_jd: str,
    resume_emb: np.ndarray,
    jd_emb: np.ndarray,
    jd_keywords: List[dict],
    original_resume: str,
    original_jd: str,
    detailed_resume_analysis: DetailedResumeAnalysis,
    resume_quality: ResumeQuality,
    section_analysis: SectionAnalysis,
    weights: dict | None = None,
    required_years: Optional[float] = None,
    fresher_role: bool = False,
) -> dict:
    w_dense            = weights.get("dense", W_DENSE) if weights else W_DENSE
    w_bm25             = weights.get("bm25", W_BM25) if weights else W_BM25
    w_tfidf            = weights.get("tfidf", W_TFIDF) if weights else W_TFIDF
    w_keyword          = weights.get("keyword", W_KEYWORD) if weights else W_KEYWORD
    w_positional_skill = weights.get("positional_skill", W_POSITIONAL_SKILL) if weights else W_POSITIONAL_SKILL
    w_experience_skill = weights.get("experience_skill", W_EXPERIENCE_SKILL) if weights else W_EXPERIENCE_SKILL
    w_resume_quality   = weights.get("resume_quality", W_RESUME_QUALITY) if weights else W_RESUME_QUALITY

    # Recalculate total weight to ensure it sums to 1.0, especially if custom weights are provided
    total_actual_weight = w_dense + w_bm25 + w_tfidf + w_keyword + w_positional_skill + w_experience_skill + w_resume_quality
    if abs(total_actual_weight - 1.0) > 1e-6:
        # If custom weights don't sum to 1, normalize them
        factor = 1.0 / total_actual_weight
        w_dense            *= factor
        w_bm25             *= factor
        w_tfidf            *= factor
        w_keyword          *= factor
        w_positional_skill *= factor
        w_experience_skill *= factor
        w_resume_quality   *= factor

    # Dense/semantic component: neural sentence-embedding cosine similarity
    # by default, or a pure TF-IDF + Truncated-SVD (Latent Semantic Analysis)
    # cosine similarity when config.USE_NEURAL_EMBEDDINGS is False — see
    # lsa_similarity.py for why this is a legitimate classical substitute
    # rather than just "TF-IDF again". No behavior changes unless that flag
    # is explicitly set, so existing deployments are unaffected.
    if config.USE_NEURAL_EMBEDDINGS:
        dense = _cosine_dense(resume_emb, jd_emb)
        dense_method = "neural (MiniLM-L6-v2)"
    else:
        dense = lsa_score(original_resume, original_jd)
        dense_method = "classical (TF-IDF + Truncated SVD / LSA)"

    bm25  = _bm25_score(original_resume, original_jd)  # uses original text
    tfidf = _tfidf_score(original_resume, original_jd)

    taxonomy_keys, token_set = build_resume_skill_set(original_resume)
    resume_lower = original_resume.lower()
    kw_ratio, matched, missing = _keyword_score(
        jd_keywords, resume_lower, taxonomy_keys, token_set
    )

    # New scoring components
    positional_skill_score = _positional_skill_score(jd_keywords, detailed_resume_analysis)
    skill_depth_score = _experience_skill_score(
        jd_keywords,
        detailed_resume_analysis,
        required_years=required_years,
        fresher_role=fresher_role,
    )
    overall_experience_fit = _overall_experience_fit_score(
        detailed_resume_analysis.total_experience_years,
        required_years,
        fresher_role,
    )
    experience_skill_score = (
        overall_experience_fit
        if overall_experience_fit is not None
        else skill_depth_score
    )
    combined_resume_quality_score = _resume_quality_score(resume_quality, section_analysis)

    final = (
        w_dense * dense +
        w_bm25 * bm25 +
        w_tfidf * tfidf +
        w_keyword * kw_ratio +
        w_positional_skill * positional_skill_score +
        w_experience_skill * experience_skill_score +
        w_resume_quality * combined_resume_quality_score
    ) * 100

    return {
        "match_percentage": round(float(np.clip(final, 0.0, 100.0)), 1),
        "alignment_index": round(float(np.clip(final, 0.0, 100.0)), 1),
        "dense_method":     dense_method,
        "dense_score":      round(dense    * 100, 1),
        "bm25_score":       round(bm25     * 100, 1),
        "tfidf_score":      round(tfidf    * 100, 1),
        "keyword_coverage": round(kw_ratio * 100, 1),
        "positional_skill_score": round(positional_skill_score * 100, 1),
        "experience_skill_score": round(experience_skill_score * 100, 1),
        "combined_resume_quality_score": round(combined_resume_quality_score * 100, 1),
        "matched_skills":   matched,
        "missing_skills":   missing,
        "total_keywords":   len(jd_keywords),
    }


DEFAULT_WEIGHTS = {
    "dense": W_DENSE,
    "bm25": W_BM25,
    "tfidf": W_TFIDF,
    "keyword": W_KEYWORD,
    "positional_skill": W_POSITIONAL_SKILL,
    "experience_skill": W_EXPERIENCE_SKILL,
    "resume_quality": W_RESUME_QUALITY,
}
