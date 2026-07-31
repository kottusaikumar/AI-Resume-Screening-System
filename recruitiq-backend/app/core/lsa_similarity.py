"""
lsa_similarity.py
------------------
Latent Semantic Analysis (Deerwester et al., 1990) as a *pure linear-algebra*
alternative to neural sentence embeddings for the "dense/semantic" score
component.

Why this exists
----------------
scoring.py's neural dense score uses `all-MiniLM-L6-v2`, a small transformer
model. It is not an LLM and calls no external API, but it IS a pretrained
neural network. For deployments that want a fully classical, dependency-light
pipeline (no downloaded neural weights at all — only statistics + linear
algebra), this module reproduces the same *purpose* (semantic, not just
lexical, similarity) using nothing but:

    TF-IDF term-document matrix -> Truncated SVD (LSA) -> cosine similarity

Same fix pattern as the BM25 IDF bug already documented in scoring.py:
a raw 2-document (resume, JD) TF-IDF matrix gives SVD almost nothing to
factor — with N=2 there are at most 2 non-trivial singular vectors, which
degenerates towards plain cosine similarity. We apply the same fix used
for BM25: split both texts into sentences to build a corpus with N >> 2
"documents", fit TF-IDF + SVD on that corpus, then project the resume's
sentences and the JD's sentences into the shared latent space and compare
their centroid vectors. This lets SVD actually discover co-occurring
term clusters (e.g. "Django" / "Flask" / "REST API" loading onto the same
latent "backend web dev" component) instead of just measuring raw overlap.

To use this instead of (or alongside) the neural embedding score, see
`config.USE_NEURAL_EMBEDDINGS`.
"""

import re
from typing import List

import numpy as np
from sklearn.decomposition import TruncatedSVD
from sklearn.feature_extraction.text import TfidfVectorizer

_SENT_SPLIT_RE = re.compile(r"[.\n|•\u2022]+")


def _split_sentences(text: str) -> List[str]:
    parts = [s.strip() for s in _SENT_SPLIT_RE.split(text)]
    return [s for s in parts if len(s.split()) >= 3]


def lsa_score(original_resume: str, original_jd: str, n_components: int = 40) -> float:
    """
    Latent Semantic Analysis similarity between a resume and a JD, computed
    with only TF-IDF + truncated SVD (no neural network).

    Returns a value in [0, 1]. Negative similarity is treated as no alignment;
    orthogonal documents remain at zero rather than receiving an artificial
    50% baseline.
    """
    resume_sents = _split_sentences(original_resume)
    jd_sents = _split_sentences(original_jd)

    if not resume_sents or not jd_sents:
        return 0.0

    corpus = resume_sents + jd_sents
    try:
        vec = TfidfVectorizer(
            stop_words="english",
            ngram_range=(1, 2),
            min_df=1,
            sublinear_tf=True,
        )
        tfidf_matrix = vec.fit_transform(corpus)
    except ValueError:
        return 0.0

    n_resume = len(resume_sents)
    # LSA can only infer a latent relationship from this request-local corpus
    # when the two sides are connected by at least one normalized term feature.
    # With completely disjoint vocabularies the term-document matrix has
    # disconnected blocks; truncating that matrix can otherwise introduce a
    # small, platform-dependent positive cosine that is not evidence of fit.
    resume_support = np.asarray(tfidf_matrix[:n_resume].sum(axis=0)).ravel() > 0
    jd_support = np.asarray(tfidf_matrix[n_resume:].sum(axis=0)).ravel() > 0
    if not np.any(resume_support & jd_support):
        return 0.0

    n_features = tfidf_matrix.shape[1]
    n_samples = tfidf_matrix.shape[0]
    # SVD needs k < min(n_samples, n_features); fall back gracefully on tiny inputs.
    k = max(1, min(n_components, n_features - 1, n_samples - 1))
    if k < 1:
        return 0.0

    svd = TruncatedSVD(n_components=k, random_state=42)
    latent = svd.fit_transform(tfidf_matrix)  # (n_samples, k)

    resume_vec = latent[:n_resume].mean(axis=0)
    jd_vec = latent[n_resume:].mean(axis=0)

    norm_r = np.linalg.norm(resume_vec)
    norm_j = np.linalg.norm(jd_vec)
    if norm_r == 0 or norm_j == 0:
        return 0.0

    raw_cosine = float(np.dot(resume_vec, jd_vec) / (norm_r * norm_j))
    return float(np.clip(raw_cosine, 0.0, 1.0))
