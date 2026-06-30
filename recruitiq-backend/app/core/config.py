"""
config.py
---------
Centralized environment configuration, loaded from a .env file (if present)
or real environment variables. Backs the security/production-hardening
settings: API key auth, CORS allow-list, upload size limit, rate limiting,
and basic logging.

Every setting has a safe default for local development, so the app still
runs out of the box with no .env file at all — but each one can be locked
down via environment variables before deploying anywhere reachable by
other people.
"""

import logging
import os

from dotenv import load_dotenv

load_dotenv()


def _get_int(key: str, default: int) -> int:
    val = os.getenv(key)
    try:
        return int(val) if val else default
    except ValueError:
        return default


def _get_list(key: str, default: list[str]) -> list[str]:
    val = os.getenv(key)
    if not val:
        return default
    return [item.strip() for item in val.split(",") if item.strip()]


HOST = os.getenv("HOST", "0.0.0.0")
PORT = _get_int("PORT", 8000)

# --- API key auth -----------------------------------------------------------
# If API_KEY is unset/empty, auth is disabled — convenient for local-only
# development. Set API_KEY in .env (and the matching VITE_API_KEY on the
# frontend) before running this anywhere reachable by anyone else.
API_KEY = os.getenv("API_KEY", "").strip()
AUTH_ENABLED = bool(API_KEY)

# --- CORS allow-list ----------------------------------------------------
# Comma-separated list of allowed frontend origins, e.g.:
#   ALLOWED_ORIGINS=http://localhost:8080,https://myapp.example.com
ALLOWED_ORIGINS = _get_list(
    "ALLOWED_ORIGINS",
    [
        "http://localhost:3000",
        "http://localhost:8080",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:8080",
    ],
)

# --- Upload limits ------------------------------------------------------
MAX_UPLOAD_MB = _get_int("MAX_UPLOAD_MB", 10)
MAX_UPLOAD_BYTES = MAX_UPLOAD_MB * 1024 * 1024
MAX_TEXT_FIELD_CHARS = _get_int("MAX_TEXT_FIELD_CHARS", 50_000)

# --- Rate limiting --------------------------------------------------------
# Applied to the expensive /api/analyze endpoint. Format: "<count>/<period>",
# e.g. "10/minute". See slowapi/limits docs for the full syntax.
ANALYZE_RATE_LIMIT = os.getenv("ANALYZE_RATE_LIMIT", "10/minute")
DEFAULT_RATE_LIMIT = os.getenv("DEFAULT_RATE_LIMIT", "60/minute")

# --- Logging --------------------------------------------------------------
logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO"),
    format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
)
logger = logging.getLogger("recruitiq")
