"""
embedding.py
------------
Sentence-transformer embeddings with disk caching.
Model: all-MiniLM-L6-v2 — lightweight, fast, strong semantic similarity.
"""

import numpy as np

from app.core import config
from app.core.caching import get_content_hash, get_embedding_from_cache, set_embedding_in_cache

# Lazily loaded: if USE_NEURAL_EMBEDDINGS=false (classical/LSA-only scoring),
# nothing ever imports sentence-transformers or downloads model weights at
# all, which matters for fully offline / minimal-dependency deployments.
_model = None


def _get_model():
    global _model
    if _model is None:
        from sentence_transformers import SentenceTransformer
        kwargs = {}
        if config.EMBEDDING_MODEL_REVISION:
            kwargs["revision"] = config.EMBEDDING_MODEL_REVISION
        _model = SentenceTransformer(config.EMBEDDING_MODEL, **kwargs)
    return _model


def get_embedding(text: str) -> np.ndarray:
    """
    Return cached embedding if available, otherwise compute and cache.
    Returns a zero vector without loading the model when neural embeddings
    are disabled (scoring.py ignores this value in that mode and uses the
    classical LSA score instead — see lsa_similarity.py).
    """
    if not config.USE_NEURAL_EMBEDDINGS:
        return np.zeros(384, dtype=np.float32)  # MiniLM-L6-v2 output dim
    text_hash = get_content_hash(text)
    cached = get_embedding_from_cache(text_hash)
    if cached is not None:
        return cached
    embedding = _get_model().encode(text, convert_to_tensor=False)
    set_embedding_in_cache(text_hash, embedding)
    return embedding
