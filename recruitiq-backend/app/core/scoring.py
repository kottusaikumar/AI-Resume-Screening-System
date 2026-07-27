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
from typing import List, Set, Tuple, Optional
from app.models.schemas import DetailedResumeAnalysis, SkillWithContext, JobRole, ResumeQuality, SectionAnalysis

import numpy as np
from rank_bm25 import BM25Okapi
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity

from app.core import config
from app.core.caching import get_content_hash, get_bm25_from_cache, set_bm25_in_cache
from app.core.lsa_similarity import lsa_score
from app.core.nlp_utils import skill_in_resume, build_resume_skill_set, normalise

W_DENSE               = 0.25
W_BM25                = 0.15
W_TFIDF               = 0.00  # Diagnostic only; BM25 already covers lexical relevance
W_KEYWORD             = 0.30
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


def _positional_skill_score(
    jd_keywords: List[dict],
    detailed_resume_analysis: DetailedResumeAnalysis,
) -> float:
    """
    Scores skills based on their presence in high-value sections of the resume.
    Higher weight for skills in Summary, Skills section, or recent experience.
    """
    if not jd_keywords: return 1.0

    total_jd_weight = sum(kw.get("score", 1.0) for kw in jd_keywords)
    if total_jd_weight == 0: return 0.0

    matched_positional_weight = 0.0
    resume_skills_with_context = detailed_resume_analysis.all_extracted_skills

    for jd_kw in jd_keywords:
        jd_skill_key = normalise(jd_kw["key"])
        jd_skill_score = jd_kw.get("score", 1.0)

        for res_skill_ctx in resume_skills_with_context:
            res_skill_key = normalise(res_skill_ctx.skill)
            if res_skill_key == jd_skill_key:
                # Assign positional bonus
                position_bonus = 0.35
                if res_skill_ctx.section == "summary":
                    position_bonus = 0.65
                elif res_skill_ctx.section == "skills":
                    position_bonus = 0.55
                elif res_skill_ctx.section == "experience" and res_skill_ctx.end_year and res_skill_ctx.end_year >= datetime.datetime.now().year - 2:
                    position_bonus = 1.0
                elif res_skill_ctx.section == "experience":
                    position_bonus = 0.8
                elif res_skill_ctx.section == "projects":
                    position_bonus = 0.9
                
                matched_positional_weight += (jd_skill_score * position_bonus)
                break # Count each JD skill only once, even if mentioned multiple times in resume

    # Normalize by total possible JD keyword weight, clipped to 1.0
    score = min(1.0, matched_positional_weight / total_jd_weight) if total_jd_weight > 0 else 0.0
    return score

def _experience_skill_score(
    jd_keywords: List[dict],
    detailed_resume_analysis: DetailedResumeAnalysis,
) -> float:
    """
    Scores skills based on the estimated duration of their usage in the resume.
    This is a heuristic to reward deeper experience with key skills.
    """
    if not jd_keywords: return 1.0

    total_jd_weight = sum(kw.get("score", 1.0) for kw in jd_keywords)
    if total_jd_weight == 0: return 0.0

    matched_experience_weight = 0.0
    resume_skills_with_context = detailed_resume_analysis.all_extracted_skills

    for jd_kw in jd_keywords:
        jd_skill_key = normalise(jd_kw["key"])
        jd_skill_score = jd_kw.get("score", 1.0)
        
        max_skill_duration = 0
        for res_skill_ctx in resume_skills_with_context:
            res_skill_key = normalise(res_skill_ctx.skill)
            if res_skill_key == jd_skill_key and res_skill_ctx.duration_months is not None:
                max_skill_duration = max(max_skill_duration, res_skill_ctx.duration_months)
        
        # Reward skills with longer estimated usage
        # Max duration capped at 5 years (60 months) for scoring purposes to prevent single long roles from dominating
        matched_experience_weight += jd_skill_score * min(1.0, max_skill_duration / 60.0)

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
    for kw in jd_keywords:
        weight = max(float(kw.get("score", 1)), 0.0) or 1.0
        total_weight += weight
        if skill_in_resume(kw["key"], resume_lower, taxonomy_keys, token_set):
            matched.append(kw["display"])
            matched_weight += weight
        else:
            missing.append(kw["display"])
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
    experience_skill_score = _experience_skill_score(jd_keywords, detailed_resume_analysis)
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
