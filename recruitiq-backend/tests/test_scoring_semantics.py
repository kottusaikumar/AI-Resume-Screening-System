import numpy as np
import pytest

from app.core.presentation import compute_match_label
from app.core.presentation import (
    extract_experience_requirement,
    extract_required_years,
)
from app.core.nlp_utils import (
    build_resume_skill_set,
    extract_jd_keywords,
    extract_skills_from_text,
    normalise,
    skill_in_resume,
    skill_keys_match,
)
from app.core.scoring import (
    DEFAULT_WEIGHTS,
    _cosine_dense,
    _experience_skill_score,
    _keyword_score,
    _overall_experience_fit_score,
    calculate_match_score,
)
from app.core.lsa_similarity import lsa_score
from app.core.resume_analyzer import detect_mandatory_skills
from app.models.schemas import (
    DetailedResumeAnalysis,
    ResumeQuality,
    ResumeSections,
    SectionAnalysis,
    SkillWithContext,
)


def test_negative_dense_similarity_is_not_inflated_to_partial_match():
    resume = np.array([1.0, 0.0], dtype=float)
    opposite_job = np.array([-1.0, 0.0], dtype=float)

    assert _cosine_dense(resume, opposite_job) == 0.0


def test_unrelated_lsa_documents_do_not_receive_half_credit():
    resume_sentences = [
        "Built Python APIs",
        "Deployed FastAPI services",
        "Managed PostgreSQL databases",
        "Tested backend systems",
    ]
    unrelated_job_sentences = [
        "Created brand logos",
        "Designed print typography",
        "Illustrated marketing posters",
        "Edited Adobe Photoshop assets",
    ]
    variants = [
        (resume_sentences, unrelated_job_sentences),
        (list(reversed(resume_sentences)), unrelated_job_sentences),
        (resume_sentences, list(reversed(unrelated_job_sentences))),
        (list(reversed(resume_sentences)), list(reversed(unrelated_job_sentences))),
    ]

    for resume_parts, job_parts in variants:
        resume = ". ".join(resume_parts) + "."
        unrelated_job = ". ".join(job_parts) + "."
        assert lsa_score(resume, unrelated_job) == 0.0


def test_lsa_preserves_similarity_when_meaningful_features_connect_documents():
    resume = "Built Python FastAPI services. Designed reliable REST APIs."
    related_job = "Seeking a Python engineer to build FastAPI APIs and backend services."

    assert lsa_score(resume, related_job) > 0.0


def test_fresher_experience_range_preserves_zero_and_upper_bound():
    jd = "0-1 years of experience. Freshers are encouraged to apply."

    requirement = extract_experience_requirement(jd)

    assert requirement is not None
    assert requirement.minimum_years == 0.0
    assert requirement.maximum_years == 1.0
    assert requirement.is_fresher is True
    assert extract_required_years(jd) == 1.0


def test_fresher_experience_score_values_projects_without_inventing_duration():
    analysis = DetailedResumeAnalysis(
        sections=ResumeSections(),
        all_extracted_skills=[
            SkillWithContext(
                skill="Python",
                section="experience",
                duration_months=6,
            ),
            SkillWithContext(
                skill="TensorFlow",
                section="projects",
            ),
        ],
    )
    keywords = [
        {"key": "python", "display": "Python", "score": 5},
        {"key": "tensorflow", "display": "TensorFlow", "score": 5},
    ]

    assert _experience_skill_score(
        keywords,
        analysis,
        required_years=1.0,
        fresher_role=True,
    ) == 0.85


def test_explicit_or_skills_are_scored_as_one_satisfied_requirement():
    jd = "Basic knowledge of TensorFlow, PyTorch, or Keras."
    resume = "Built and evaluated neural networks using TensorFlow and Keras."
    keywords = extract_jd_keywords(jd)
    taxonomy_keys, token_set = build_resume_skill_set(resume)

    coverage, matched, missing = _keyword_score(
        keywords,
        resume.lower(),
        taxonomy_keys,
        token_set,
    )

    assert coverage == 1.0
    assert "TensorFlow" in matched
    assert "Keras" in matched
    assert not any("PyTorch" in item for item in missing)


def test_required_skills_section_applies_until_the_next_heading():
    jd = """
    ## Required Skills
    Python
    SQL

    ## Preferred Skills
    AWS
    """

    assert detect_mandatory_skills(jd, ["Python", "AWS"]) == ["Python"]


def test_required_skills_outweigh_preferred_skills():
    jd = """
    ## Required Skills
    Python

    ## Preferred Skills
    Docker
    """

    keywords = {item["display"]: item for item in extract_jd_keywords(jd)}

    assert keywords["Python"]["requirement_level"] == "required"
    assert keywords["Docker"]["requirement_level"] == "preferred"
    assert (
        keywords["Python"]["importance_multiplier"]
        > keywords["Docker"]["importance_multiplier"]
    )


def test_concrete_ai_work_proves_parent_capability_but_not_the_reverse():
    assert skill_keys_match("Natural Language Processing", "Named Entity Recognition")
    assert skill_keys_match("Computer Vision", "Face Recognition")
    assert skill_keys_match("Generative AI", "RAG")
    assert not skill_keys_match("Named Entity Recognition", "Natural Language Processing")


def test_cross_role_it_taxonomy_covers_security_qa_network_and_support():
    text = (
        "Used Splunk for SIEM incident response, Selenium for test automation, "
        "configured DNS and Active Directory, and handled ServiceNow help desk tickets."
    )
    skills = set(extract_skills_from_text(text))

    assert {"Splunk", "SIEM", "Incident Response"}.issubset(skills)
    assert {"Selenium", "Test Automation"}.issubset(skills)
    assert {"DNS", "Active Directory", "ServiceNow", "Help Desk"}.issubset(skills)


def test_provider_services_prove_their_cloud_platform():
    resume = "Deployed an API with AWS Lambda and stored artifacts in S3."
    taxonomy_keys, token_set = build_resume_skill_set(resume)

    assert normalise("AWS") in taxonomy_keys
    assert _keyword_score(
        [{"key": normalise("AWS"), "display": "AWS", "score": 5}],
        resume.lower(),
        taxonomy_keys,
        token_set,
    )[0] == 1.0


def test_short_skill_does_not_match_inside_a_longer_word():
    taxonomy_keys, token_set = build_resume_skill_set("GitHub portfolio")

    assert not skill_in_resume("git", "github portfolio", taxonomy_keys, token_set)
    assert skill_in_resume(
        "git",
        "used git for version control",
        *build_resume_skill_set("Used Git for version control"),
    )


def test_degree_disciplines_are_not_misreported_as_missing_skills():
    jd = """
    AI Engineer
    Build artificial intelligence applications.

    Qualifications
    Bachelor's degree in Computer Science, Data Science, or a related field.
    """

    keywords = extract_jd_keywords(jd)
    displays = {item["display"] for item in keywords}
    keys = {item["key"] for item in keywords}

    assert normalise("Artificial Intelligence") in keys
    assert "Computer Science" not in displays
    assert "Data Science" not in displays


@pytest.mark.parametrize(
    ("job_description", "aligned_resume"),
    [
        (
            "Required Skills\nJava, Spring Boot, REST API, SQL, Git",
            "Built Java Spring Boot REST APIs backed by SQL and managed with Git.",
        ),
        (
            "Required Skills\nPython, SQL, ETL, Airflow, Apache Spark",
            "Created Python and SQL ETL pipelines orchestrated with Airflow and Spark.",
        ),
        (
            "Required Skills\nAWS, Docker, Kubernetes, Terraform, CI/CD, Linux",
            "Deployed Linux services to AWS using Docker, Kubernetes, Terraform and CI/CD.",
        ),
        (
            "Required Skills\nSIEM, Incident Response, Vulnerability Assessment, Network Security",
            "Investigated SIEM alerts, led incident response, vulnerability assessment and network security reviews.",
        ),
        (
            "Required Skills\nSelenium, API Testing, Regression Testing, Test Cases, Jira",
            "Automated Selenium API testing, regression test cases, and tracked defects in Jira.",
        ),
        (
            "Required Skills\nActive Directory, DNS, DHCP, Technical Support, ServiceNow, Troubleshooting",
            "Provided technical support and troubleshooting for Active Directory, DNS and DHCP tickets in ServiceNow.",
        ),
    ],
)
def test_aligned_evidence_scores_across_major_it_families(
    job_description,
    aligned_resume,
):
    keywords = extract_jd_keywords(job_description)
    aligned_taxonomy, aligned_tokens = build_resume_skill_set(aligned_resume)
    unrelated_resume = "Designed print advertisements and coordinated retail promotions."
    unrelated_taxonomy, unrelated_tokens = build_resume_skill_set(unrelated_resume)

    aligned_coverage = _keyword_score(
        keywords,
        aligned_resume.lower(),
        aligned_taxonomy,
        aligned_tokens,
    )[0]
    unrelated_coverage = _keyword_score(
        keywords,
        unrelated_resume.lower(),
        unrelated_taxonomy,
        unrelated_tokens,
    )[0]

    assert aligned_coverage >= 0.8
    assert unrelated_coverage <= 0.2


def test_overall_experience_is_calibrated_to_the_jd_minimum():
    assert _overall_experience_fit_score(0.5, 0.0, True) == 1.0
    assert _overall_experience_fit_score(1.5, 3.0, False) == 0.5
    assert _overall_experience_fit_score(5.0, 3.0, False) == 1.0
    assert _overall_experience_fit_score(2.0, None, False) is None


def test_production_weights_exclude_redundant_and_non_fit_signals():
    assert DEFAULT_WEIGHTS["tfidf"] == 0.0
    assert DEFAULT_WEIGHTS["resume_quality"] == 0.0
    assert DEFAULT_WEIGHTS["keyword"] == 0.5
    assert DEFAULT_WEIGHTS["dense"] + DEFAULT_WEIGHTS["bm25"] == 0.2
    assert sum(DEFAULT_WEIGHTS.values()) == 1.0


def test_historical_default_settings_migrate_to_role_aware_defaults(monkeypatch):
    from app import api

    monkeypatch.setattr(
        api.storage,
        "get_setting",
        lambda *_args, **_kwargs: {
            "dense": 0.25,
            "bm25": 0.15,
            "tfidf": 0.0,
            "keyword": 0.30,
            "positional_skill": 0.15,
            "experience_skill": 0.15,
            "resume_quality": 0.0,
        },
    )

    assert api._load_scoring_weights("showcase") == DEFAULT_WEIGHTS


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
