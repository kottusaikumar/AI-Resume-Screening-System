"""
api.py
------
FastAPI backend for RecruitIQ — enhanced with:
- Section analysis (NER-based section detection)
- Resume quality scoring (action verbs, quantified bullets, ATS format)
- Experience year estimation + seniority level
- Mandatory skill detection (dealbreaker gaps)
- Richer recommendations combining all signals
- JWT authentication, role authorization, tenant isolation, rate limiting,
  and enforced upload limits

POST /api/analyze — multipart/form-data
  Fields:
    resume          : file (.pdf, .docx, .txt — max MAX_UPLOAD_MB, default 10MB)
    job_description : text
    mandatory_skills: optional comma-separated list of must-have skills

GET /api/health — liveness check (no auth required)

Every endpoint except health and login requires a bearer access token.
"""

import json
import os
import tempfile
import time
import uuid
from contextlib import asynccontextmanager
from typing import List

from fastapi import APIRouter, Depends, FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response
from pydantic import BaseModel, Field, ValidationError
from slowapi import Limiter
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address
from starlette.concurrency import run_in_threadpool
from starlette.middleware.trustedhost import TrustedHostMiddleware

from app.core import config
from app.core.auth import (
    CurrentUser, authenticate, ensure_bootstrap_admin, ensure_showcase_user, hash_password,
    issue_access_token, require_admin, require_recruiter, require_user,
)
from app.core.embedding import get_embedding
from app.core.nlp_utils import clean_text_for_embedding, extract_jd_keywords
from app.core.pii_redaction import redact_pii
from app.core.recommendations import generate_recommendations
from app.core.resume_review import build_review_summary, identify_strengths, suggest_roles
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
from app.core.upload_security import UnsafeUploadError, validate_file_signature
from app.core.resume_analyzer import (
    analyze_sections,
    analyze_quality,
    estimate_experience,
    detect_mandatory_skills,
    analyze_detailed_resume,
)
from app.models.schemas import (
    CreateUserRequest, DetailedResumeAnalysis, LoginRequest, LoginResponse,
    ResumeReviewResponse, ScreeningResponse, UserSummary,
)

logger = config.logger


@asynccontextmanager
async def lifespan(_: FastAPI):
    _startup()
    yield


app = FastAPI(
    title="RecruitIQ API",
    version="3.0.0",
    docs_url=None if config.IS_PRODUCTION else "/docs",
    redoc_url=None if config.IS_PRODUCTION else "/redoc",
    lifespan=lifespan,
)

if config.ALLOWED_HOSTS:
    app.add_middleware(TrustedHostMiddleware, allowed_hosts=config.ALLOWED_HOSTS)

app.add_middleware(
    CORSMiddleware,
    allow_origins=config.ALLOWED_ORIGINS,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "Accept"],
)


@app.middleware("http")
async def security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "no-referrer"
    response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
    response.headers["Cache-Control"] = "no-store"
    return response

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


# Every endpoint registered on this router requires an authenticated user.
api_router = APIRouter(dependencies=[Depends(require_user)])


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


def _startup():
    config.validate_runtime_config()
    storage.init_db()
    ensure_bootstrap_admin()
    if config.SHOWCASE_MODE:
        ensure_showcase_user()
    logger.info("RecruitIQ API starting. Environment=%s origins=%s", config.ENVIRONMENT, config.ALLOWED_ORIGINS)


@app.get("/api/health")
def health():
    database_ok = storage.check_database()
    return {
        "status": "ok" if database_ok else "degraded",
        "version": "3.0.0",
        "database": "ok" if database_ok else "unavailable",
    }


@app.post("/api/auth/login", response_model=LoginResponse)
@limiter.limit("5/minute")
def login(request: Request, credentials: LoginRequest):
    user = authenticate(credentials.email, credentials.password)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid email or password.")
    token, expires_in = issue_access_token(user)
    storage.audit(user["organization_id"], user["id"], "auth.login", "user", user["id"])
    return LoginResponse(
        access_token=token,
        expires_in=expires_in,
        user=UserSummary(
            id=user["id"], email=user["email"], role=user["role"],
            organization_id=user["organization_id"],
        ),
    )


@app.post("/api/auth/showcase", response_model=LoginResponse)
@limiter.limit("30/minute")
def showcase_access(request: Request):
    """Issue a limited recruiter session without exposing login credentials."""
    if not config.SHOWCASE_MODE:
        raise HTTPException(status_code=404, detail="Showcase access is disabled.")
    user = ensure_showcase_user()
    token, expires_in = issue_access_token(user)
    return LoginResponse(
        access_token=token,
        expires_in=expires_in,
        user=UserSummary(
            id=user["id"], email=user["email"], role=user["role"],
            organization_id=user["organization_id"],
        ),
    )


@api_router.get("/api/auth/me", response_model=UserSummary)
def current_user(user: CurrentUser = Depends(require_user)):
    return UserSummary(**user.__dict__)


@api_router.get("/api/users")
def get_users(admin: CurrentUser = Depends(require_admin)):
    return {"users": storage.list_users(admin.organization_id)}


@api_router.post("/api/users", status_code=201)
def create_user(payload: CreateUserRequest, admin: CurrentUser = Depends(require_admin)):
    if payload.role not in {"admin", "recruiter", "reviewer"}:
        raise HTTPException(status_code=400, detail="Role must be admin, recruiter, or reviewer.")
    if storage.get_user_by_email(payload.email):
        raise HTTPException(status_code=409, detail="A user with this email already exists.")
    try:
        password_hash = hash_password(payload.password)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    user = storage.create_user(payload.email, password_hash, payload.role, admin.organization_id)
    storage.audit(
        admin.organization_id, admin.id, "user.created", "user", user["id"],
        {"role": payload.role},
    )
    return {"user": {k: user[k] for k in ("id", "email", "role", "is_active", "created_at")}}


def _load_scoring_weights(organization_id: str) -> dict:
    """Return production evidence weights while neutralizing retired signals."""
    stored = storage.get_setting(organization_id, "scoring_weights", None)
    if not isinstance(stored, dict) or not stored:
        return DEFAULT_WEIGHTS.copy()

    legacy_keys = ("dense", "bm25", "tfidf", "keyword")
    new_keys = ("positional_skill", "experience_skill", "resume_quality")
    if all(key in stored for key in legacy_keys) and not any(key in stored for key in new_keys):
        legacy_total = sum(max(0.0, float(stored[key])) for key in legacy_keys)
        if legacy_total <= 0:
            return DEFAULT_WEIGHTS.copy()
        new_share = sum(DEFAULT_WEIGHTS[key] for key in new_keys)
        migrated = {
            key: max(0.0, float(stored[key])) / legacy_total * (1.0 - new_share)
            for key in legacy_keys
        }
        migrated.update({key: DEFAULT_WEIGHTS[key] for key in new_keys})
        migrated["tfidf"] = 0.0
        migrated["resume_quality"] = 0.0
        active_total = sum(migrated.values())
        return {key: value / active_total for key, value in migrated.items()}

    merged = DEFAULT_WEIGHTS.copy()
    for key in merged:
        if key in stored:
            merged[key] = max(0.0, float(stored[key]))
    # These remain in the response for backward compatibility and diagnostics,
    # but cannot influence job alignment.
    merged["tfidf"] = 0.0
    merged["resume_quality"] = 0.0
    total = sum(merged.values())
    if total <= 0:
        return DEFAULT_WEIGHTS.copy()
    return {key: value / total for key, value in merged.items()}


def _run_screening(
    resume_text: str,
    resume_filename: str,
    job_description: str,
    mandatory_skills: str,
    start_time: float,
    blind_mode: bool = False,
    save_to_history: bool = True,
    organization_id: str = "",
    created_by: str = "",
) -> ScreeningResponse:
    """
    Shared single-resume screening pipeline. Extracted so both the
    single-resume /api/analyze endpoint and the multi-resume
    /api/analyze/bulk endpoint (candidate ranking for one JD) run the exact
    same scoring logic rather than duplicating it.
    """
    if blind_mode:
        # Optional fairness pre-processing: strip name/location/contact
        # signals from the resume text before anything else touches it, so
        # scoring, quality analysis, and recommendations are all computed
        # on the de-identified version. See pii_redaction.py.
        resume_text = redact_pii(resume_text)

    # Clean texts for embedding and BM25
    cleaned_resume = clean_text_for_embedding(resume_text)
    cleaned_jd = clean_text_for_embedding(job_description)
    if not cleaned_jd.strip():
        raise HTTPException(status_code=400, detail="Job description could not be processed.")

    # Get embeddings (cached; a no-op zero-vector when USE_NEURAL_EMBEDDINGS
    # is disabled — see embedding.py / lsa_similarity.py)
    resume_emb = get_embedding(cleaned_resume)
    jd_emb = get_embedding(cleaned_jd)

    # Extract JD keywords
    jd_keywords = extract_jd_keywords(job_description, max_skills=30)

    # Load configurable scoring weights (falls back to defaults if unset)
    weights = _load_scoring_weights(organization_id)

    # --- Resume Analysis Pipeline ---
    section_analysis  = analyze_sections(resume_text)
    resume_quality    = analyze_quality(resume_text)
    experience_info   = estimate_experience(resume_text)
    detailed_analysis = analyze_detailed_resume(resume_text)

    # Hybrid score
    scores = calculate_match_score(
        cleaned_resume=cleaned_resume,
        cleaned_jd=cleaned_jd,
        resume_emb=resume_emb,
        jd_emb=jd_emb,
        jd_keywords=jd_keywords,
        original_resume=resume_text,
        original_jd=job_description,
        detailed_resume_analysis=detailed_analysis,
        resume_quality=resume_quality,
        section_analysis=section_analysis,
        weights=weights,
    )

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

    # --- Presentation-layer fields for the NeuralRecruit UI ---
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
        detailed_analysis=detailed_analysis,
        recommendations=recommendations,
        resume_filename=resume_filename,
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

    if save_to_history:
        try:
            storage.save_scan(response.model_dump(), organization_id, created_by)
        except Exception:
            # History persistence is best-effort — never fail the user's scan
            # just because the local history database couldn't be written to.
            logger.exception("Failed to save scan %s to history.", report_id)

    logger.info(
        "Scan complete: report_id=%s file=%s match=%.0f%% duration=%.2fs",
        report_id, resume_filename, response.match_percentage, processing_time,
    )
    return response


async def _extract_uploaded_resume_text(resume: UploadFile, ext: str) -> str:
    """Stream-save + extract text for one uploaded resume file, cleaning up
    the temp file afterwards regardless of outcome."""
    tmp_path = await _save_upload_enforcing_limit(resume, ext)
    try:
        with open(tmp_path, "rb") as uploaded_file:
            validate_file_signature(uploaded_file.read(), ext)
        # Native extraction is fast, but scanned-PDF OCR is CPU intensive.
        # Keep both off the async event loop so other API requests stay responsive.
        return await run_in_threadpool(extract_text, tmp_path)
    finally:
        try:
            os.unlink(tmp_path)
        except OSError:
            pass


def _run_resume_review(
    resume_text: str,
    resume_filename: str,
    start_time: float,
    blind_mode: bool = False,
) -> ResumeReviewResponse:
    """Build a JD-independent resume review without producing a match score."""
    analysis_text = redact_pii(resume_text) if blind_mode else resume_text
    section_analysis = analyze_sections(analysis_text)
    resume_quality = analyze_quality(analysis_text)
    experience_info = estimate_experience(analysis_text)
    detailed_analysis = analyze_detailed_resume(analysis_text)
    extracted_skills = sorted(
        {
            skill.skill.strip()
            for skill in detailed_analysis.all_extracted_skills
            if skill.skill.strip()
        },
        key=str.lower,
    )
    recommendations = generate_recommendations(
        missing_skills=[],
        section_analysis=section_analysis,
        resume_quality=resume_quality,
        experience_info=experience_info,
        mandatory_missing=[],
    )
    health_score = round(
        (
            resume_quality.quality_score
            + resume_quality.ats_format_score
            + section_analysis.completeness_score
        )
        / 3,
        1,
    )
    processing_time = round(time.monotonic() - start_time, 2)
    review_id = f"NRR-{uuid.uuid4().hex[:8].upper()}"
    response = ResumeReviewResponse(
        review_id=review_id,
        resume_filename=resume_filename,
        resume_preview=analysis_text.strip()[:600],
        resume_health_score=health_score,
        section_analysis=section_analysis,
        resume_quality=resume_quality,
        experience_info=experience_info,
        detailed_analysis=detailed_analysis,
        extracted_skills=extracted_skills,
        strengths=identify_strengths(
            section_analysis,
            resume_quality,
            experience_info,
            detailed_analysis,
        ),
        recommendations=recommendations,
        suggested_roles=suggest_roles(extracted_skills),
        review_summary=build_review_summary(
            section_analysis,
            resume_quality,
            experience_info,
            len(extracted_skills),
        ),
        processing_time_seconds=processing_time,
    )
    logger.info(
        "Resume review complete: review_id=%s file=%s duration=%.2fs",
        review_id,
        resume_filename,
        processing_time,
    )
    return response


@api_router.post("/api/review-resume", response_model=ResumeReviewResponse)
@limiter.limit(config.ANALYZE_RATE_LIMIT)
async def review_resume(
    request: Request,
    resume: UploadFile = File(...),
    blind_mode: bool = Form(default=config.BLIND_SCREENING_DEFAULT),
    _: CurrentUser = Depends(require_recruiter),
):
    """Review resume structure, evidence, and ATS quality without a JD."""
    if not resume.filename:
        raise HTTPException(status_code=400, detail="No resume file provided.")

    start_time = time.monotonic()
    safe_filename = os.path.basename(resume.filename).strip()
    ext = os.path.splitext(safe_filename)[1].lower()
    if ext not in SUPPORTED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type '{ext}'. Supported: {', '.join(sorted(SUPPORTED_EXTENSIONS))}",
        )

    try:
        resume_text = await _extract_uploaded_resume_text(resume, ext)
    except (UnsupportedFileTypeError, UnsafeUploadError, RuntimeError) as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    if not resume_text.strip():
        raise HTTPException(
            status_code=400,
            detail=(
                "Could not extract readable text from the resume, including after local OCR. "
                "Please upload a clearer PDF, DOCX, or TXT file."
            ),
        )

    return await run_in_threadpool(
        _run_resume_review,
        resume_text=resume_text,
        resume_filename=safe_filename,
        start_time=start_time,
        blind_mode=blind_mode,
    )


@api_router.post("/api/analyze", response_model=ScreeningResponse)
@limiter.limit(config.ANALYZE_RATE_LIMIT)
async def analyze(
    request: Request,
    resume: UploadFile = File(...),
    job_description: str = Form(...),
    mandatory_skills: str = Form(default=""),
    blind_mode: bool = Form(default=config.BLIND_SCREENING_DEFAULT),
    user: CurrentUser = Depends(require_recruiter),
):
    if not resume.filename:
        raise HTTPException(status_code=400, detail="No resume file provided.")

    start_time = time.monotonic()

    safe_filename = os.path.basename(resume.filename).strip()
    ext = os.path.splitext(safe_filename)[1].lower()
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

    try:
        resume_text = await _extract_uploaded_resume_text(resume, ext)
    except (UnsupportedFileTypeError, UnsafeUploadError) as e:
        raise HTTPException(status_code=400, detail=str(e))
    except RuntimeError as e:
        raise HTTPException(status_code=400, detail=str(e))

    if not resume_text.strip():
        raise HTTPException(
            status_code=400,
            detail=(
                "Could not extract readable text from the resume, including after local OCR. "
                "Please upload a clearer PDF, DOCX, or TXT file."
            ),
        )

    return await run_in_threadpool(
        _run_screening,
        resume_text=resume_text,
        resume_filename=safe_filename,
        job_description=job_description,
        mandatory_skills=mandatory_skills,
        start_time=start_time,
        blind_mode=blind_mode,
        save_to_history=not config.SHOWCASE_MODE,
        organization_id=user.organization_id,
        created_by=user.id,
    )


class BulkCandidateResult(BaseModel):
    rank: int
    result: ScreeningResponse


class BulkScreeningResponse(BaseModel):
    job_description_preview: str
    total_candidates: int
    failed: List[str] = []
    candidates: List[BulkCandidateResult]


@api_router.post("/api/analyze/bulk", response_model=BulkScreeningResponse)
@limiter.limit(config.ANALYZE_RATE_LIMIT)
async def analyze_bulk(
    request: Request,
    resumes: List[UploadFile] = File(...),
    job_description: str = Form(...),
    mandatory_skills: str = Form(default=""),
    blind_mode: bool = Form(default=config.BLIND_SCREENING_DEFAULT),
    save_to_history: bool = Form(default=False),
    user: CurrentUser = Depends(require_recruiter),
):
    """
    Screen many resumes against a single job description and return them
    ranked by match_percentage — the actual "large-scale screening" use
    case (a recruiter with 200 applicants for one role), as opposed to
    /api/analyze's one-resume-at-a-time comparison.

    History is off by default here since bulk runs can be large and are
    typically exploratory; pass save_to_history=true to persist each result.
    """
    job_description = job_description.strip()
    if not job_description:
        raise HTTPException(status_code=400, detail="Job description is required.")
    if len(job_description) > config.MAX_TEXT_FIELD_CHARS:
        raise HTTPException(
            status_code=413,
            detail=f"Job description is too long (max {config.MAX_TEXT_FIELD_CHARS:,} characters).",
        )
    if not resumes:
        raise HTTPException(status_code=400, detail="At least one resume file is required.")
    if len(resumes) > config.MAX_BULK_RESUMES:
        raise HTTPException(
            status_code=413,
            detail=f"Too many resumes in one request (max {config.MAX_BULK_RESUMES}).",
        )
    reported_total = sum(resume.size or 0 for resume in resumes)
    if reported_total > config.MAX_BULK_TOTAL_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"Bulk upload is too large (max {config.MAX_BULK_TOTAL_MB}MB total).",
        )

    results: List[ScreeningResponse] = []
    failed: List[str] = []

    for resume in resumes:
        start_time = time.monotonic()
        if not resume.filename:
            failed.append("(unnamed file)")
            continue
        safe_filename = os.path.basename(resume.filename).strip()
        ext = os.path.splitext(safe_filename)[1].lower()
        if ext not in SUPPORTED_EXTENSIONS:
            failed.append(f"{resume.filename} (unsupported file type)")
            continue
        try:
            resume_text = await _extract_uploaded_resume_text(resume, ext)
        except (UnsupportedFileTypeError, UnsafeUploadError, RuntimeError):
            failed.append(f"{resume.filename} (could not be read)")
            continue
        if not resume_text.strip():
            failed.append(f"{resume.filename} (no extractable text)")
            continue

        try:
            result = await run_in_threadpool(
                _run_screening,
                resume_text=resume_text,
                resume_filename=safe_filename,
                job_description=job_description,
                mandatory_skills=mandatory_skills,
                start_time=start_time,
                blind_mode=blind_mode,
                save_to_history=save_to_history and not config.SHOWCASE_MODE,
                organization_id=user.organization_id,
                created_by=user.id,
            )
            results.append(result)
        except HTTPException:
            raise
        except Exception:
            logger.exception("Bulk screening failed for %s", resume.filename)
            failed.append(f"{resume.filename} (processing error)")

    # Rank by match_percentage descending — ties broken by keyword coverage
    # (a candidate who covers the JD's emphasized skills more fully ranks
    # above one who reaches the same overall score mostly via semantic
    # similarity alone).
    ranked = sorted(
        results, key=lambda r: (r.match_percentage, r.keyword_coverage), reverse=True
    )

    return BulkScreeningResponse(
        job_description_preview=job_description[:300],
        total_candidates=len(ranked),
        failed=failed,
        candidates=[
            BulkCandidateResult(rank=i, result=r) for i, r in enumerate(ranked, start=1)
        ],
    )


class RoleComparisonInput(BaseModel):
    title: str = Field(min_length=1, max_length=120)
    description: str = Field(min_length=20, max_length=config.MAX_TEXT_FIELD_CHARS)
    mandatory_skills: str = Field(default="", max_length=config.MAX_TEXT_FIELD_CHARS)


class RoleComparisonResult(BaseModel):
    rank: int
    role_id: str
    role_title: str
    result: ScreeningResponse


class MultiRoleScreeningResponse(BaseModel):
    resume_filename: str
    total_roles: int
    failed: List[str] = Field(default_factory=list)
    roles: List[RoleComparisonResult]


@api_router.post("/api/analyze/roles", response_model=MultiRoleScreeningResponse)
@limiter.limit(config.ANALYZE_RATE_LIMIT)
async def analyze_against_roles(
    request: Request,
    resume: UploadFile = File(...),
    roles_json: str = Form(...),
    blind_mode: bool = Form(default=config.BLIND_SCREENING_DEFAULT),
    save_to_history: bool = Form(default=False),
    user: CurrentUser = Depends(require_recruiter),
):
    """Compare one resume with several named job descriptions and rank the roles."""
    if not resume.filename:
        raise HTTPException(status_code=400, detail="No resume file provided.")

    try:
        payload = json.loads(roles_json)
        if not isinstance(payload, list):
            raise ValueError
        roles = [RoleComparisonInput.model_validate(item) for item in payload]
    except (json.JSONDecodeError, TypeError, ValueError, ValidationError):
        raise HTTPException(
            status_code=400,
            detail="Roles must be a valid list containing a title and job description.",
        )

    if len(roles) < 2:
        raise HTTPException(status_code=400, detail="Add at least two job descriptions.")
    if len(roles) > config.MAX_BULK_JOB_DESCRIPTIONS:
        raise HTTPException(
            status_code=413,
            detail=(
                "Too many job descriptions in one request "
                f"(max {config.MAX_BULK_JOB_DESCRIPTIONS})."
            ),
        )
    if sum(len(role.description) + len(role.mandatory_skills) for role in roles) > (
        config.MAX_BULK_JD_TOTAL_CHARS
    ):
        raise HTTPException(
            status_code=413,
            detail=(
                "Combined job descriptions are too long "
                f"(max {config.MAX_BULK_JD_TOTAL_CHARS:,} characters)."
            ),
        )

    safe_filename = os.path.basename(resume.filename).strip()
    ext = os.path.splitext(safe_filename)[1].lower()
    if ext not in SUPPORTED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type '{ext}'. Supported: {', '.join(sorted(SUPPORTED_EXTENSIONS))}",
        )
    try:
        resume_text = await _extract_uploaded_resume_text(resume, ext)
    except (UnsupportedFileTypeError, UnsafeUploadError, RuntimeError) as error:
        raise HTTPException(status_code=400, detail=str(error))
    if not resume_text.strip():
        raise HTTPException(status_code=400, detail="The resume contains no extractable text.")

    completed: list[tuple[int, str, ScreeningResponse]] = []
    failed: list[str] = []
    for index, role in enumerate(roles, start=1):
        try:
            result = await run_in_threadpool(
                _run_screening,
                resume_text=resume_text,
                resume_filename=safe_filename,
                job_description=role.description.strip(),
                mandatory_skills=role.mandatory_skills.strip(),
                start_time=time.monotonic(),
                blind_mode=blind_mode,
                save_to_history=save_to_history and not config.SHOWCASE_MODE,
                organization_id=user.organization_id,
                created_by=user.id,
            )
            completed.append((index, role.title.strip(), result))
        except HTTPException as error:
            failed.append(f"{role.title.strip()} ({error.detail})")
        except Exception:
            logger.exception("Role comparison failed for %s", role.title)
            failed.append(f"{role.title.strip()} (processing error)")

    ranked = sorted(
        completed,
        key=lambda item: (item[2].match_percentage, item[2].keyword_coverage),
        reverse=True,
    )
    return MultiRoleScreeningResponse(
        resume_filename=safe_filename,
        total_roles=len(ranked),
        failed=failed,
        roles=[
            RoleComparisonResult(
                rank=rank,
                role_id=f"role-{original_index}",
                role_title=title,
                result=result,
            )
            for rank, (original_index, title, result) in enumerate(ranked, start=1)
        ],
    )


# ---------------------------------------------------------------------------
# History
# ---------------------------------------------------------------------------
@api_router.get("/api/history")
def get_history(limit: int = 50, user: CurrentUser = Depends(require_user)):
    return {"scans": storage.list_scans(user.organization_id, limit=limit)}


@api_router.get("/api/history/{report_id}", response_model=ScreeningResponse)
def get_history_item(report_id: str, user: CurrentUser = Depends(require_user)):
    result = storage.get_scan(report_id, user.organization_id)
    if result is None:
        raise HTTPException(status_code=404, detail="Report not found.")
    return result


@api_router.delete("/api/history/{report_id}")
def delete_history_item(report_id: str, user: CurrentUser = Depends(require_recruiter)):
    deleted = storage.delete_scan(report_id, user.organization_id, user.id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Report not found.")
    return {"deleted": True}


@api_router.delete("/api/history")
def clear_history(admin: CurrentUser = Depends(require_admin)):
    count = storage.clear_scans(admin.organization_id, admin.id)
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
def get_analytics(user: CurrentUser = Depends(require_user)):
    return storage.compute_analytics(user.organization_id)


# ---------------------------------------------------------------------------
# Settings (scoring weights)
# ---------------------------------------------------------------------------
class ScoringWeights(BaseModel):
    dense: float
    bm25: float
    tfidf: float
    keyword: float
    positional_skill: float
    experience_skill: float
    resume_quality: float


@api_router.get("/api/settings")
def get_settings(user: CurrentUser = Depends(require_user)):
    weights = _load_scoring_weights(user.organization_id)
    return {"scoring_weights": weights}


@api_router.put("/api/settings")
def update_settings(weights: ScoringWeights, admin: CurrentUser = Depends(require_admin)):
    # TF-IDF overlaps with BM25, and document presentation quality is not job
    # qualification. Keep both retired from the production aggregate.
    weights.tfidf = 0.0
    weights.resume_quality = 0.0
    total = (
        weights.dense + weights.bm25 + weights.tfidf + weights.keyword +
        weights.positional_skill + weights.experience_skill + weights.resume_quality
    )
    if total <= 0:
        raise HTTPException(status_code=400, detail="Weights must sum to a positive number.")
    # Normalise so all seven weights always sum to 1, regardless of what was sent.
    normalised = {
        "dense": round(weights.dense / total, 4),
        "bm25": round(weights.bm25 / total, 4),
        "tfidf": round(weights.tfidf / total, 4),
        "keyword": round(weights.keyword / total, 4),
        "positional_skill": round(weights.positional_skill / total, 4),
        "experience_skill": round(weights.experience_skill / total, 4),
        "resume_quality": round(weights.resume_quality / total, 4),
    }
    storage.set_setting(admin.organization_id, "scoring_weights", normalised, admin.id)
    logger.info("Scoring weights updated: %s", normalised)
    return {"scoring_weights": normalised}


@api_router.post("/api/settings/reset")
def reset_settings(admin: CurrentUser = Depends(require_admin)):
    storage.set_setting(admin.organization_id, "scoring_weights", DEFAULT_WEIGHTS, admin.id)
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
def export_history_pdf(report_id: str, user: CurrentUser = Depends(require_user)):
    result = storage.get_scan(report_id, user.organization_id)
    if result is None:
        raise HTTPException(status_code=404, detail="Report not found.")
    pdf_bytes = generate_report_pdf(result)
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{report_id}.pdf"'},
    )


app.include_router(api_router)
