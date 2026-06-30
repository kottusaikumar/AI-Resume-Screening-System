"""
caching.py
----------
Disk-based caching for embeddings and BM25 objects using diskcache.
MD5 content hashing prevents redundant computation for repeated inputs.
"""

import hashlib
import os
from typing import Union

import numpy as np
from diskcache import Cache

_THIS_DIR = os.path.dirname(os.path.abspath(__file__))
_PROJECT_ROOT = os.path.abspath(os.path.join(_THIS_DIR, "..", "..", ".."))
_CACHE_DIR = os.path.join(_PROJECT_ROOT, "data", "cache")
os.makedirs(_CACHE_DIR, exist_ok=True)

cache = Cache(_CACHE_DIR)


def get_content_hash(text: str) -> str:
    return hashlib.md5(text.encode("utf-8")).hexdigest()


def get_embedding_from_cache(text_hash: str) -> Union[np.ndarray, None]:
    return cache.get(f"emb_{text_hash}")


def set_embedding_in_cache(text_hash: str, embedding: np.ndarray) -> None:
    cache.set(f"emb_{text_hash}", embedding)


def get_bm25_from_cache(corpus_hash: str) -> Union[object, None]:
    return cache.get(f"bm25_{corpus_hash}")


def set_bm25_in_cache(corpus_hash: str, bm25_obj: object) -> None:
    cache.set(f"bm25_{corpus_hash}", bm25_obj)
