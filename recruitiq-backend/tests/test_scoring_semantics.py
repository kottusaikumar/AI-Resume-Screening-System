import numpy as np

from app.core.presentation import compute_match_label
from app.core.scoring import DEFAULT_WEIGHTS, _cosine_dense, calculate_match_score
from app.core.lsa_similarity import lsa_score
from app.models.schemas import (
    DetailedResumeAnalysis,
    ResumeQuality,
    ResumeSections,
    SectionAnalysis,
)


def test_negative_dense_similarity_is_not_inflated_to_partial_match():
    resume = np.array([1.0, 0.0], dtype=float)
    opposite_job = np.array([-1.0, 0.0], dtype=float)

    assert _cosine_dense(resume, opposite_job) == 0.0


def test_unrelated_lsa_documents_do_not_receive_half_credit():
    resume = (
        "Built Python APIs. Deployed FastAPI services. Managed PostgreSQL databases. "
        "Tested backend systems."
    )
    unrelated_job = (
        "Created brand logos. Designed print typography. Illustrated marketing posters. "
        "Edited Adobe Photoshop assets."
    )

    assert lsa_score(resume, unrelated_job) < 0.05


def test_production_weights_exclude_redundant_and_non_fit_signals():
    assert DEFAULT_WEIGHTS["tfidf"] == 0.0
    assert DEFAULT_WEIGHTS["resume_quality"] == 0.0
    assert sum(DEFAULT_WEIGHTS.values()) == 1.0


def test_resume_presentation_quality_does_not_change_job_alignment():
    common = dict(
        cleaned_resume="python fastapi service",
        cleaned_jd="python api engineer",
        resume_emb=np.array([1.0, 0.0], dtype=float),
        jd_emb=np.array([1.0, 0.0], dtype=float),
        jd_keywords=[{"key": "python", "display": "Python", "score": 1.0}],
        original_resume="Built Python FastAPI services in production.",
        original_jd="Seeking an engineer with Python API experience.",
        detailed_resume_analysis=DetailedResumeAnalysis(sections=ResumeSections()),
        weights=DEFAULT_WEIGHTS,
    )

    low_quality = calculate_match_score(
        **common,
        resume_quality=ResumeQuality(quality_score=5),
        section_analysis=SectionAnalysis(completeness_score=10),
    )
    polished = calculate_match_score(
        **common,
        resume_quality=ResumeQuality(quality_score=100),
        section_analysis=SectionAnalysis(completeness_score=100),
    )

    assert low_quality["match_percentage"] == polished["match_percentage"]
    assert low_quality["alignment_index"] == low_quality["match_percentage"]


def test_fit_labels_describe_evidence_not_candidate_quality():
    assert compute_match_label(80) == "High Evidence Alignment"
    assert compute_match_label(55) == "Moderate Evidence Alignment"
    assert compute_match_label(35) == "Low Evidence Alignment"
    assert compute_match_label(10) == "Insufficient Evidence"
