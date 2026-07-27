"""Centralized, validated runtime configuration for RecruitIQ."""

import logging
import os
import secrets
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()


def _get_int(key: str, default: int, minimum: int = 1) -> int:
    value = os.getenv(key)
    try:
        parsed = int(value) if value else default
    except ValueError:
        parsed = default
    return max(minimum, parsed)


def _get_bool(key: str, default: bool) -> bool:
    value = os.getenv(key)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


def _get_list(key: str, default: list[str]) -> list[str]:
    value = os.getenv(key)
    if not value:
        return default
    return [item.strip() for item in value.split(",") if item.strip()]


ENVIRONMENT = os.getenv("ENVIRONMENT", "development").strip().lower()
IS_PRODUCTION = ENVIRONMENT == "production"
HOST = os.getenv("HOST", "127.0.0.1" if not IS_PRODUCTION else "0.0.0.0")
PORT = _get_int("PORT", 8000)

ALLOWED_ORIGINS = _get_list(
    "ALLOWED_ORIGINS",
    ["http://localhost:8080", "http://127.0.0.1:8080"],
)
ALLOWED_HOSTS = _get_list(
    "ALLOWED_HOSTS",
    ["localhost", "127.0.0.1", "testserver"] if not IS_PRODUCTION else [],
)

DATA_DIR = Path(os.getenv("DATA_DIR", Path(__file__).resolve().parents[2] / "data"))
DATABASE_PATH = Path(os.getenv("DATABASE_PATH", DATA_DIR / "recruitiq.db"))

# Authentication. A random development secret is intentionally process-local;
# set AUTH_SECRET in .env to keep sessions valid across restarts.
AUTH_SECRET = os.getenv("AUTH_SECRET", "").strip()
if not AUTH_SECRET and not IS_PRODUCTION:
    AUTH_SECRET = secrets.token_urlsafe(48)
AUTH_ISSUER = os.getenv("AUTH_ISSUER", "neuralrecruit-local")
ACCESS_TOKEN_MINUTES = _get_int("ACCESS_TOKEN_MINUTES", 60, minimum=5)
BOOTSTRAP_ORG_NAME = os.getenv("BOOTSTRAP_ORG_NAME", "Local Organization").strip()
BOOTSTRAP_ADMIN_EMAIL = os.getenv("BOOTSTRAP_ADMIN_EMAIL", "admin@localhost").strip().lower()
BOOTSTRAP_ADMIN_PASSWORD = os.getenv("BOOTSTRAP_ADMIN_PASSWORD", "local-dev-change-me")
SHOWCASE_MODE = _get_bool("SHOWCASE_MODE", True)
SHOWCASE_USER_EMAIL = os.getenv(
    "SHOWCASE_USER_EMAIL", "showcase@neuralrecruit.local"
).strip().lower()

MAX_UPLOAD_MB = _get_int("MAX_UPLOAD_MB", 10)
MAX_UPLOAD_BYTES = MAX_UPLOAD_MB * 1024 * 1024
MAX_BULK_TOTAL_MB = _get_int("MAX_BULK_TOTAL_MB", 50)
MAX_BULK_TOTAL_BYTES = MAX_BULK_TOTAL_MB * 1024 * 1024
MAX_TEXT_FIELD_CHARS = _get_int("MAX_TEXT_FIELD_CHARS", 50_000)
MAX_BULK_RESUMES = _get_int("MAX_BULK_RESUMES", 10)
MAX_BULK_JOB_DESCRIPTIONS = _get_int("MAX_BULK_JOB_DESCRIPTIONS", 10)
MAX_BULK_JD_TOTAL_CHARS = _get_int("MAX_BULK_JD_TOTAL_CHARS", 200_000)
STORE_RESUME_PREVIEW = _get_bool("STORE_RESUME_PREVIEW", False)
BLIND_SCREENING_DEFAULT = _get_bool("BLIND_SCREENING_DEFAULT", True)

# Local OCR is used only when a PDF page has no usable embedded text.
# Limits keep image-only uploads from monopolizing CPU or memory.
PDF_OCR_ENABLED = _get_bool("PDF_OCR_ENABLED", True)
PDF_OCR_MIN_TEXT_CHARS = _get_int("PDF_OCR_MIN_TEXT_CHARS", 40)
PDF_OCR_MAX_PAGES = _get_int("PDF_OCR_MAX_PAGES", 5)
PDF_OCR_DPI = _get_int("PDF_OCR_DPI", 110, minimum=96)
PDF_OCR_MAX_PIXELS_PER_PAGE = _get_int("PDF_OCR_MAX_PIXELS_PER_PAGE", 12_000_000)

USE_NEURAL_EMBEDDINGS = _get_bool("USE_NEURAL_EMBEDDINGS", False)
EMBEDDING_MODEL = os.getenv("EMBEDDING_MODEL", "sentence-transformers/all-MiniLM-L6-v2")
EMBEDDING_MODEL_REVISION = os.getenv(
    "EMBEDDING_MODEL_REVISION", "1110a243fdf4706b3f48f1d95db1a4f5529b4d41"
).strip() or None

ANALYZE_RATE_LIMIT = os.getenv("ANALYZE_RATE_LIMIT", "10/minute")
DEFAULT_RATE_LIMIT = os.getenv("DEFAULT_RATE_LIMIT", "60/minute")

logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO"),
    format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
)
logger = logging.getLogger("recruitiq")


def validate_runtime_config() -> None:
    """Fail closed for unsafe public-production configuration."""
    errors: list[str] = []
    if IS_PRODUCTION and len(AUTH_SECRET) < 32:
        errors.append("AUTH_SECRET must be at least 32 characters in production")
    if IS_PRODUCTION and not ALLOWED_ORIGINS:
        errors.append("ALLOWED_ORIGINS must contain the deployed frontend origin")
    if IS_PRODUCTION and not ALLOWED_HOSTS:
        errors.append("ALLOWED_HOSTS must contain the public API hostname")
    if IS_PRODUCTION and BOOTSTRAP_ADMIN_PASSWORD == "local-dev-change-me":
        errors.append("BOOTSTRAP_ADMIN_PASSWORD must be changed in production")
    if errors:
        raise RuntimeError("Unsafe production configuration: " + "; ".join(errors))
