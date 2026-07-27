"""
schemas.py
----------
Pydantic models for RecruitIQ API request/response.
Enhanced with section analysis, ATS score, resume quality metrics,
experience scoring, and mandatory skill detection.
"""
from typing import List, Optional
from pydantic import BaseModel, ConfigDict, Field


class SectionAnalysis(BaseModel):
    has_summary: bool = False
    has_experience: bool = False
    has_education: bool = False
    has_skills: bool = False
    has_certifications: bool = False
    has_projects: bool = False
    completeness_score: float = 0.0  # 0–100


class ResumeQuality(BaseModel):
    action_verb_count: int = 0
    quantified_bullets: int = 0
    total_bullets: int = 0
    word_count: int = 0
    avg_bullet_length: float = 0.0
    quality_score: float = 0.0  # 0–100
    ats_format_score: float = 0.0  # 0–100 (parsability)


class ExperienceInfo(BaseModel):
    estimated_years: float = 0.0
    seniority_level: str = "Unknown"  # Entry / Mid / Senior / Lead


class FunnelStage(BaseModel):
    stage: str
    status: str
    done: bool = False


class SkillWithContext(BaseModel):
    skill: str
    section: str
    start_year: Optional[int] = None
    end_year: Optional[int] = None
    duration_months: Optional[int] = None


class JobRole(BaseModel):
    title: Optional[str] = None
    company: Optional[str] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    duration_months: Optional[int] = None
    description: Optional[str] = None
    skills: List[str] = []


class EducationEntry(BaseModel):
    degree: Optional[str] = None
    institution: Optional[str] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    description: Optional[str] = None


class ResumeSections(BaseModel):
    summary: Optional[str] = None
    experience: List[JobRole] = []
    education: List[EducationEntry] = []
    skills: List[str] = []
    projects: Optional[str] = None
    certifications: Optional[str] = None
    other: Optional[str] = None


class DetailedResumeAnalysis(BaseModel):
    sections: ResumeSections
    all_extracted_skills: List[SkillWithContext] = []
    total_experience_years: float = 0.0
    seniority_level: str = "Unknown"


class ScreeningResponse(BaseModel):
    model_config = ConfigDict(protected_namespaces=())

    # Core scores
    match_percentage: float
    alignment_index: float = 0.0
    dense_method: str = "neural (MiniLM-L6-v2)"
    dense_score: float
    bm25_score: float
    tfidf_score: float
    keyword_coverage: float
    positional_skill_score: float = 0.0
    experience_skill_score: float = 0.0
    combined_resume_quality_score: float = 0.0

    # Skills
    matched_skills: List[str]
    missing_skills: List[str]
    total_keywords: int
    mandatory_missing: List[str] = []

    # NEW: section & quality analysis
    section_analysis: Optional[SectionAnalysis] = None
    resume_quality: Optional[ResumeQuality] = None
    experience_info: Optional[ExperienceInfo] = None
    detailed_analysis: Optional[DetailedResumeAnalysis] = None

    # Recommendations & meta
    recommendations: List[str]
    resume_filename: str
    resume_preview: str

    # NEW: presentation-layer fields for the NeuralRecruit UI
    match_label: str = "Limited Match"
    retention_risk: str = "Not assessed"
    required_years: Optional[float] = None
    salary_fit: str = "Not specified"
    alignment_summary: str = ""
    alignment_gap: Optional[str] = None
    funnel: List[FunnelStage] = []
    confidence: float = 0.0
    report_id: str = ""
    model_name: str = "MiniLM-L6 Hybrid Scorer"
    processing_time_seconds: float = 0.0
    decision_status: str = "Human review required"
    advisory_only: bool = True
    score_disclaimer: str = (
        "Evidence alignment is an advisory retrieval indicator, not a probability "
        "of qualification or job success. Human review is required."
    )


class SuggestedRole(BaseModel):
    title: str
    matching_skills: List[str] = Field(default_factory=list)
    evidence_count: int = 0


class ResumeReviewResponse(BaseModel):
    model_config = ConfigDict(protected_namespaces=())

    review_type: str = "resume_review"
    review_id: str
    resume_filename: str
    resume_preview: str
    resume_health_score: float
    section_analysis: SectionAnalysis
    resume_quality: ResumeQuality
    experience_info: ExperienceInfo
    detailed_analysis: DetailedResumeAnalysis
    extracted_skills: List[str] = Field(default_factory=list)
    strengths: List[str] = Field(default_factory=list)
    recommendations: List[str] = Field(default_factory=list)
    suggested_roles: List[SuggestedRole] = Field(default_factory=list)
    review_summary: str
    processing_time_seconds: float = 0.0
    analyzer_name: str = "Deterministic Resume Analyzer"
    advisory_only: bool = True
    job_match_assessed: bool = False


class LoginRequest(BaseModel):
    email: str = Field(min_length=3, max_length=254)
    password: str = Field(min_length=12, max_length=256)


class UserSummary(BaseModel):
    id: str
    email: str
    role: str
    organization_id: str


class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int
    user: UserSummary


class CreateUserRequest(BaseModel):
    email: str = Field(min_length=3, max_length=254)
    password: str = Field(min_length=12, max_length=256)
    role: str = "recruiter"
