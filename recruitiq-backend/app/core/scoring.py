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

import re
from typing import List, Set, Tuple

import numpy as np
from rank_bm25 import BM25Okapi
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity

from app.core.caching import get_content_hash, get_bm25_from_cache, set_bm25_in_cache
from app.core.nlp_utils import skill_in_resume, build_resume_skill_set

W_DENSE   = 0.40
W_BM25    = 0.25
W_TFIDF   = 0.15
W_KEYWORD = 0.20


def _cosine_dense(resume_emb: np.ndarray, jd_emb: np.ndarray) -> float:
    norm_r = np.linalg.norm(resume_emb)
    norm_j = np.linalg.norm(jd_emb)
    if norm_r == 0 or norm_j == 0:
        return 0.0
    raw = float(np.dot(resume_emb, jd_emb) / (norm_r * norm_j))
    return float((raw + 1) / 2)


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

    corpus_key = get_content_hash(original_resume[:80] + original_jd[:80])
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


def _keyword_score(
    jd_keywords: List[dict],
    resume_lower: str,
    taxonomy_keys: Set[str],
    token_set: Set[str],
) -> Tuple[float, List[str], List[str]]:
    if not jd_keywords:
        return 1.0, [], []
    matched, missing = [], []
    for kw in jd_keywords:
        if skill_in_resume(kw["key"], resume_lower, taxonomy_keys, token_set):
            matched.append(kw["display"])
        else:
            missing.append(kw["display"])
    coverage = len(matched) / len(jd_keywords)
    return coverage, matched, missing


def calculate_match_score(
    cleaned_resume: str,
    cleaned_jd: str,
    resume_emb: np.ndarray,
    jd_emb: np.ndarray,
    jd_keywords: List[dict],
    original_resume: str,
    original_jd: str,
    weights: dict | None = None,
) -> dict:
    w_dense   = weights.get("dense",   W_DENSE)   if weights else W_DENSE
    w_bm25    = weights.get("bm25",    W_BM25)    if weights else W_BM25
    w_tfidf   = weights.get("tfidf",   W_TFIDF)   if weights else W_TFIDF
    w_keyword = weights.get("keyword", W_KEYWORD) if weights else W_KEYWORD

    dense = _cosine_dense(resume_emb, jd_emb)
    bm25  = _bm25_score(original_resume, original_jd)  # uses original text
    tfidf = _tfidf_score(original_resume, original_jd)

    taxonomy_keys, token_set = build_resume_skill_set(original_resume)
    resume_lower = original_resume.lower()
    kw_ratio, matched, missing = _keyword_score(
        jd_keywords, resume_lower, taxonomy_keys, token_set
    )

    final = (w_dense * dense + w_bm25 * bm25 + w_tfidf * tfidf + w_keyword * kw_ratio) * 100

    return {
        "match_percentage": round(min(final, 100.0), 1),
        "dense_score":      round(dense    * 100, 1),
        "bm25_score":       round(bm25     * 100, 1),
        "tfidf_score":      round(tfidf    * 100, 1),
        "keyword_coverage": round(kw_ratio * 100, 1),
        "matched_skills":   matched,
        "missing_skills":   missing,
        "total_keywords":   len(jd_keywords),
    }


DEFAULT_WEIGHTS = {"dense": W_DENSE, "bm25": W_BM25, "tfidf": W_TFIDF, "keyword": W_KEYWORD}
