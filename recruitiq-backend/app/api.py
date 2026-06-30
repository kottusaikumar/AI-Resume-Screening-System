"""
api.py
------
FastAPI backend for RecruitIQ — enhanced with:
- Section analysis (NER-based section detection)
- Resume quality scoring (action verbs, quantified bullets, ATS format)
- Experience year estimation + seniority level
- Mandatory skill detection (dealbreaker gaps)
- Richer recommendations combining all signals
- API key auth, CORS allow-list, rate limiting, and enforced upload limits

POST /api/analyze — multipart/form-data
  Fields:
    resume          : file (.pdf, .docx, .txt — max MAX_UPLOAD_MB, default 10MB)
    job_description : text
    mandatory_skills: optional comma-separated list of must-have skills

GET /api/health — liveness check (no auth required)

Every endpoint below /api/health requires the X-API-Key header to match
API_KEY, if API_KEY is set in the environment. See app/core/config.py.
"""

import os
import tempfile
import time
import uuid

from fastapi import APIRouter, Depends, FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response
from fastapi.security import APIKeyHeader
from pydantic import BaseModel
from slowapi import Limiter
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address

from app.core import config
from app.core.embedding import get_embedding
from app.core.nlp_utils import clean_text_for_embedding, extract_jd_keywords
from app.core.recommendations import generate_recommendations
from app.core.scoring import calculate_match_score, DEFAULT_WEIGHTS
from app.core.pdf_report import generate_report_pdf
from app.core import storage
from app.core.skills_taxonomy import (
    PROGRAMMING_LANGUAGES, WEB_FRONTEND, WEB_BACKEND, DATABASES,
    ML_FRAMEWORKS, ML_TECHNIQUES, NLP_SKILLS, GENERATIVE_AI,
    COMPUTER_VISION, DATA_SKILLS, MLOps, CLOUD, DEVOPS,
    DOMAIN_SKILLS, SOFT_SKILLS, UNIQUE_SKILLS,
)
from app.core.presentation import (
    compute_confidence,
    compute_funnel,
    compute_match_label,
    compute_retention_risk,
    compute_salary_fit,
    extract_required_years,
    generate_alignment_gap,
    generate_alignment_summary,
)
from app.core.text_extraction import (
    SUPPORTED_EXTENSIONS,
    UnsupportedFileTypeError,
    extract_text,
)
from app.core.resume_analyzer import (
    analyze_sections,
    analyze_quality,
    estimate_experience,
    detect_mandatory_skills,
)
from app.models.schemas import ScreeningResponse

logger = config.logger

app = FastAPI(title="RecruitIQ API", version="2.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=config.ALLOWED_ORIGINS,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)

# --- Rate limiting ----------------------------------------------------------
limiter = Limiter(key_func=get_remote_address, default_limits=[config.DEFAULT_RATE_LIMIT])
app.state.limiter = limiter


@app.exception_handler(RateLimitExceeded)
def _rate_limit_handler(request: Request, exc: RateLimitExceeded) -> Response:
    # Match the rest of the API's error shape ({"detail": ...}) instead of
    # slowapi's default {"error": ...}, so the frontend's error handling
    # doesn't need a special case for this one response type.
    response = JSONResponse(
        {"detail": "Too many requests. Please wait a moment and try again."},
        status_code=429,
    )
    return limiter._inject_headers(response, request.state.view_rate_limit)


# --- API key auth -------------------------------------------------------
_api_key_header = APIKeyHeader(name="X-API-Key", auto_error=False)


def require_api_key(key: str = Depends(_api_key_header)) -> None:
    if not config.AUTH_ENABLED:
        return  # No API_KEY configured — auth disabled, open access (local dev only).
    if key != config.API_KEY:
        raise HTTPException(status_code=401, detail="Invalid or missing API key.")


# Every endpoint except /api/health requires the API key (when configured).
api_router = APIRouter(dependencies=[Depends(require_api_key)])


async def _save_upload_enforcing_limit(upload: UploadFile, ext: str) -> str:
    """
    Streams an uploaded file to a temp file in chunks, aborting as soon as
    MAX_UPLOAD_BYTES is exceeded — rather than trusting the client-reported
    Content-Length or copying an unbounded amount of data to disk first.
    """
    chunk_size = 1024 * 1024  # 1MB
    total = 0
    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=ext)
    try:
        while True:
            chunk = await upload.read(chunk_size)
            if not chunk:
                break
            total += len(chunk)
            if total > config.MAX_UPLOAD_BYTES:
                raise HTTPException(
                    status_code=413,
                    detail=f"File is too large. Max size is {config.MAX_UPLOAD_MB}MB.",
                )
            tmp.write(chunk)
    except HTTPException:
        tmp.close()
        os.unlink(tmp.name)
        raise
    finally:
        if not tmp.closed:
            tmp.close()
    return tmp.name


@app.on_event("startup")
def _startup():
    storage.init_db()
    logger.info("RecruitIQ API starting up. Auth enabled: %s. Allowed origins: %s", config.AUTH_ENABLED, config.ALLOWED_ORIGINS)
    if not config.AUTH_ENABLED:
        logger.warning("API_KEY is not set — all endpoints are open with no authentication. Set API_KEY in .env before exposing this server beyond localhost.")


@app.get("/api/health")
def health():
    return {"status": "ok", "version": "2.1.0"}


@api_router.post("/api/analyze", response_model=ScreeningResponse)
@limiter.limit(config.ANALYZE_RATE_LIMIT)
async def analyze(
    request: Request,
    resume: UploadFile = File(...),
    job_description: str = Form(...),
    mandatory_skills: str = Form(default=""),
):
    if not resume.filename:
        raise HTTPException(status_code=400, detail="No resume file provided.")

    start_time = time.monotonic()

    ext = os.path.splitext(resume.filename)[1].lower()
    if ext not in SUPPORTED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type '{ext}'. Supported: {', '.join(sorted(SUPPORTED_EXTENSIONS))}",
        )

    job_description = job_description.strip()
    if not job_description:
        raise HTTPException(status_code=400, detail="Job description is required.")
    if len(job_description) > config.MAX_TEXT_FIELD_CHARS:
        raise HTTPException(
            status_code=413,
            detail=f"Job description is too long (max {config.MAX_TEXT_FIELD_CHARS:,} characters).",
        )
    if len(mandatory_skills) > config.MAX_TEXT_FIELD_CHARS:
        raise HTTPException(status_code=413, detail="Mandatory skills field is too long.")

    # Save upload to a temp file, enforcing the size limit while streaming
    # rather than trusting Content-Length (which a client can misreport) or
    # copying an unbounded amount of data before checking anything.
    tmp_path = await _save_upload_enforcing_limit(resume, ext)
    try:
        try:
            resume_text = extract_text(tmp_path)
        except UnsupportedFileTypeError as e:
            raise HTTPException(status_code=400, detail=str(e))
        except RuntimeError as e:
            raise HTTPException(status_code=400, detail=str(e))
    finally:
        try:
            os.unlink(tmp_path)
        except OSError:
            pass

    if not resume_text.strip():
        raise HTTPException(
            status_code=400,
            detail=(
                "Could not extract text from the resume. "
                "If this is a scanned PDF, please upload a text-based PDF, DOCX, or TXT."
            ),
        )

    # Clean texts for embedding and BM25
    cleaned_resume = clean_text_for_embedding(resume_text)
    cleaned_jd = clean_text_for_embedding(job_description)
    if not cleaned_jd.strip():
        raise HTTPException(status_code=400, detail="Job description could not be processed.")

    # Get embeddings (cached)
    resume_emb = get_embedding(cleaned_resume)
    jd_emb = get_embedding(cleaned_jd)

    # Extract JD keywords
    jd_keywords = extract_jd_keywords(job_description, max_skills=30)

    # Load configurable scoring weights (falls back to defaults if unset)
    weights = storage.get_setting("scoring_weights", DEFAULT_WEIGHTS)

    # Hybrid score
    scores = calculate_match_score(
        cleaned_resume=cleaned_resume,
        cleaned_jd=cleaned_jd,
        resume_emb=resume_emb,
        jd_emb=jd_emb,
        jd_keywords=jd_keywords,
        original_resume=resume_text,
        original_jd=job_description,
        weights=weights,
    )

    # --- NEW: Resume Analysis Pipeline ---
    section_analysis  = analyze_sections(resume_text)
    resume_quality    = analyze_quality(resume_text)
    experience_info   = estimate_experience(resume_text)

    # Mandatory skills — from JD auto-detection + optional frontend override
    mandatory_missing = detect_mandatory_skills(job_description, scores["missing_skills"])
    if mandatory_skills.strip():
        user_mandatory = [s.strip() for s in mandatory_skills.split(",") if s.strip()]
        for skill in scores["missing_skills"]:
            if any(m.lower() in skill.lower() or skill.lower() in m.lower() for m in user_mandatory):
                if skill not in mandatory_missing:
                    mandatory_missing.append(skill)

    # Enhanced recommendations
    recommendations = generate_recommendations(
        missing_skills=scores["missing_skills"],
        section_analysis=section_analysis,
        resume_quality=resume_quality,
        experience_info=experience_info,
        mandatory_missing=mandatory_missing,
    )

    # --- NEW: Presentation-layer fields for the NeuralRecruit UI ---
    match_label = compute_match_label(scores["match_percentage"])
    retention_risk = compute_retention_risk(experience_info, resume_quality)
    required_years = extract_required_years(job_description)
    salary_fit = compute_salary_fit(job_description)
    alignment_summary = generate_alignment_summary(
        match_percentage=scores["match_percentage"],
        matched_skills=scores["matched_skills"],
        experience_info=experience_info,
    )
    alignment_gap = generate_alignment_gap(mandatory_missing, scores["missing_skills"])
    funnel = compute_funnel(scores["match_percentage"], mandatory_missing)
    confidence = compute_confidence(
        dense_score=scores["dense_score"],
        bm25_score=scores["bm25_score"],
        tfidf_score=scores["tfidf_score"],
        keyword_coverage=scores["keyword_coverage"],
    )
    processing_time = round(time.monotonic() - start_time, 2)
    report_id = f"RIQ-{uuid.uuid4().hex[:8].upper()}"

    response = ScreeningResponse(
        **scores,
        mandatory_missing=mandatory_missing,
        section_analysis=section_analysis,
        resume_quality=resume_quality,
        experience_info=experience_info,
        recommendations=recommendations,
        resume_filename=resume.filename,
        resume_preview=resume_text.strip()[:600],
        match_label=match_label,
        retention_risk=retention_risk,
        required_years=required_years,
        salary_fit=salary_fit,
        alignment_summary=alignment_summary,
        alignment_gap=alignment_gap,
        funnel=funnel,
        confidence=confidence,
        report_id=report_id,
        processing_time_seconds=processing_time,
    )

    try:
        storage.save_scan(response.model_dump())
    except Exception:
        # History persistence is best-effort — never fail the user's scan
        # just because the local history database couldn't be written to.
        logger.exception("Failed to save scan %s to history.", report_id)

    logger.info(
        "Scan complete: report_id=%s file=%s match=%.0f%% duration=%.2fs",
        report_id, resume.filename, response.match_percentage, processing_time,
    )

    return response


# ---------------------------------------------------------------------------
# History
# ---------------------------------------------------------------------------
@api_router.get("/api/history")
def get_history(limit: int = 50):
    return {"scans": storage.list_scans(limit=limit)}


@api_router.get("/api/history/{report_id}", response_model=ScreeningResponse)
def get_history_item(report_id: str):
    result = storage.get_scan(report_id)
    if result is None:
        raise HTTPException(status_code=404, detail="Report not found.")
    return result


@api_router.delete("/api/history/{report_id}")
def delete_history_item(report_id: str):
    deleted = storage.delete_scan(report_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Report not found.")
    return {"deleted": True}


@api_router.delete("/api/history")
def clear_history():
    count = storage.clear_scans()
    return {"deleted": count}


# ---------------------------------------------------------------------------
# Skills DB
# ---------------------------------------------------------------------------
@api_router.get("/api/skills")
def get_skills():
    categories = {
        "Programming Languages": PROGRAMMING_LANGUAGES,
        "Web Frontend": WEB_FRONTEND,
        "Web Backend": WEB_BACKEND,
        "Databases": DATABASES,
        "ML Frameworks": ML_FRAMEWORKS,
        "ML Techniques": ML_TECHNIQUES,
        "NLP": NLP_SKILLS,
        "Generative AI": GENERATIVE_AI,
        "Computer Vision": COMPUTER_VISION,
        "Data Skills": DATA_SKILLS,
        "MLOps": MLOps,
        "Cloud": CLOUD,
        "DevOps": DEVOPS,
        "Domain Knowledge": DOMAIN_SKILLS,
        "Soft Skills": SOFT_SKILLS,
    }
    return {
        "total_skills": len(UNIQUE_SKILLS),
        "categories": [{"name": k, "skills": v} for k, v in categories.items()],
    }


# ---------------------------------------------------------------------------
# Analytics
# ---------------------------------------------------------------------------
@api_router.get("/api/analytics")
def get_analytics():
    return storage.compute_analytics()


# ---------------------------------------------------------------------------
# Settings (scoring weights)
# ---------------------------------------------------------------------------
class ScoringWeights(BaseModel):
    dense: float
    bm25: float
    tfidf: float
    keyword: float


@api_router.get("/api/settings")
def get_settings():
    weights = storage.get_setting("scoring_weights", DEFAULT_WEIGHTS)
    return {"scoring_weights": weights}


@api_router.put("/api/settings")
def update_settings(weights: ScoringWeights):
    total = weights.dense + weights.bm25 + weights.tfidf + weights.keyword
    if total <= 0:
        raise HTTPException(status_code=400, detail="Weights must sum to a positive number.")
    # Normalise so the four weights always sum to 1, regardless of what was sent.
    normalised = {
        "dense": round(weights.dense / total, 4),
        "bm25": round(weights.bm25 / total, 4),
        "tfidf": round(weights.tfidf / total, 4),
        "keyword": round(weights.keyword / total, 4),
    }
    storage.set_setting("scoring_weights", normalised)
    logger.info("Scoring weights updated: %s", normalised)
    return {"scoring_weights": normalised}


@api_router.post("/api/settings/reset")
def reset_settings():
    storage.set_setting("scoring_weights", DEFAULT_WEIGHTS)
    logger.info("Scoring weights reset to defaults.")
    return {"scoring_weights": DEFAULT_WEIGHTS}


# ---------------------------------------------------------------------------
# PDF report export
# ---------------------------------------------------------------------------
@api_router.post("/api/report/pdf")
def export_report_pdf(result: ScreeningResponse):
    pdf_bytes = generate_report_pdf(result.model_dump())
    filename = f"{result.report_id or 'report'}.pdf"
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@api_router.get("/api/history/{report_id}/pdf")
def export_history_pdf(report_id: str):
    result = storage.get_scan(report_id)
    if result is None:
        raise HTTPException(status_code=404, detail="Report not found.")
    pdf_bytes = generate_report_pdf(result)
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{report_id}.pdf"'},
    )


app.include_router(api_router)
