"""Bounded in-process caches without pickle deserialization."""

import hashlib
import threading
from collections import OrderedDict
from typing import Any

import numpy as np

_MAX_ITEMS = 512
_lock = threading.RLock()
_cache: OrderedDict[str, Any] = OrderedDict()


def _get(key: str) -> Any | None:
    with _lock:
        value = _cache.get(key)
        if value is not None:
            _cache.move_to_end(key)
        return value


def _set(key: str, value: Any) -> None:
    with _lock:
        _cache[key] = value
        _cache.move_to_end(key)
        while len(_cache) > _MAX_ITEMS:
            _cache.popitem(last=False)


def get_content_hash(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def get_embedding_from_cache(text_hash: str) -> np.ndarray | None:
    return _get(f"emb_{text_hash}")


def set_embedding_in_cache(text_hash: str, embedding: np.ndarray) -> None:
    _set(f"emb_{text_hash}", embedding)


def get_bm25_from_cache(corpus_hash: str) -> object | None:
    return _get(f"bm25_{corpus_hash}")


def set_bm25_in_cache(corpus_hash: str, bm25_obj: object) -> None:
    _set(f"bm25_{corpus_hash}", bm25_obj)
