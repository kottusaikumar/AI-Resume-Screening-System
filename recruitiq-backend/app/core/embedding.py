"""
embedding.py
------------
Sentence-transformer embeddings with disk caching.
Model: all-MiniLM-L6-v2 — lightweight, fast, strong semantic similarity.
"""

import numpy as np
from sentence_transformers import SentenceTransformer

from app.core.caching import get_content_hash, get_embedding_from_cache, set_embedding_in_cache

# Load once at module import
_model = SentenceTransformer("all-MiniLM-L6-v2")


def get_embedding(text: str) -> np.ndarray:
    """Return cached embedding if available, otherwise compute and cache."""
    text_hash = get_content_hash(text)
    cached = get_embedding_from_cache(text_hash)
    if cached is not None:
        return cached
    embedding = _model.encode(text, convert_to_tensor=False)
    set_embedding_in_cache(text_hash, embedding)
    return embedding
