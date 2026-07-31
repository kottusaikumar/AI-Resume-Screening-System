import datetime

import pytest

from app.core.resume_analyzer import (
    analyze_detailed_resume,
    _extract_experience_intervals,
    _merged_month_count,
    estimate_experience,
)


def test_month_level_internships_ignore_certification_date():
    resume = """
EDUCATION
Bachelor of Technology
Aug 2021 - May 2025

EXPERIENCE
AI/ML Intern - Ozrit
Nov 2025 - Jan 2026
Built resume extraction APIs.

Machine Learning Intern - TradePath Capital
Jul 2025 - Sep 2025
Developed automated model evaluation.

PROJECTS
Disease Diagnosis Platform

CERTIFICATIONS
Emerging AI Tools - Issued April 2024
"""

    result = estimate_experience(resume)

    assert result.estimated_years == 0.5
    assert result.seniority_level == "Entry-level"


def test_overlapping_roles_are_not_double_counted():
    resume = """
PROFESSIONAL EXPERIENCE
Software Engineer
Jan 2022 - Dec 2023

Consulting Engineer
Jul 2023 - Jun 2024

EDUCATION
Bachelor of Science
"""

    result = estimate_experience(resume)

    assert result.estimated_years == 2.5
    assert result.seniority_level == "Mid-level"


def test_education_projects_and_certifications_do_not_create_experience():
    resume = """
EDUCATION
Bachelor of Technology
Aug 2021 - May 2025

PROJECTS
Portfolio application
Jan 2024 - Apr 2024

CERTIFICATIONS
Cloud Fundamentals
Issued Sep 2024
"""

    result = estimate_experience(resume)

    assert result.estimated_years == 0.0
    assert result.seniority_level == "Entry-level"


def test_present_range_uses_current_month_and_includes_both_boundary_months():
    intervals = _extract_experience_intervals(
        "Platform Engineer\nNov 2025 - Present",
        today=datetime.date(2026, 1, 15),
    )

    assert _merged_month_count(intervals) == 3


def test_year_only_ranges_keep_conservative_year_precision():
    resume = """
WORK HISTORY
Systems Engineer
2022 - 2024

SKILLS
Python, Linux
"""

    result = estimate_experience(resume)

    assert result.estimated_years == 2.0
    assert result.seniority_level == "Mid-level"


def test_attached_company_date_and_internship_experience_heading():
    resume = """
Internship Experience
Data Science Intern | Vajra.aiNOV 2024 - Feb 2025
Built a full-stack AI application.

Machine Learning Project | AUG 2024 - OCT 2024
Developed regression models.

Personal Projects
Document assistant

Certifications & Additional Training
Data Science with AI Internship (6 months) - Vajra.ai
Aug 2024 - Feb 2025
"""

    result = estimate_experience(resume)

    assert result.estimated_years == 0.5
    assert result.seniority_level == "Entry-level"


@pytest.mark.parametrize(
    ("date_range", "expected_months"),
    [
        ("Nov 2024 - Feb 2025", 4),
        ("November 2024 to February 2025", 4),
        ("NOV2024-FEB2025", 4),
        ("11/2024 - 02/2025", 4),
        ("11.2024 - 02.2025", 4),
        ("2024-11 to 2025-02", 4),
        ("Nov '24 - Feb '25", 4),
        ("Nov 2024 - Current", 15),
    ],
)
def test_common_month_range_formats(date_range, expected_months):
    intervals = _extract_experience_intervals(
        f"Software Engineer\n{date_range}",
        today=datetime.date(2026, 1, 15),
    )

    assert _merged_month_count(intervals) == expected_months


@pytest.mark.parametrize(
    "heading",
    [
        "Internship Experience",
        "Relevant Experience",
        "Professional Background",
        "Employment History",
    ],
)
def test_common_professional_section_headings(heading):
    resume = f"""
{heading}
Software Engineer
Jan 2024 - Dec 2024

EDUCATION
Bachelor of Technology
"""

    result = estimate_experience(resume)

    assert result.estimated_years == 1.0


def test_unrelated_training_duration_does_not_override_employment_dates():
    resume = """
WORK EXPERIENCE
Data Analyst
Jan 2020 - Dec 2022

CERTIFICATIONS
Cloud Internship Training (6 months)
"""

    result = estimate_experience(resume)

    assert result.estimated_years == 3.0
    assert result.seniority_level == "Mid-level"


def test_detailed_analysis_uses_the_canonical_experience_timeline():
    resume = """
INTERNSHIP EXPERIENCE
AI/ML Intern | Vajra.aiNOV 2024 - Feb 2025
Built Python and FastAPI services for machine-learning workflows.

SKILLS
Python, FastAPI, Machine Learning

EDUCATION
Bachelor of Technology
"""

    canonical = estimate_experience(resume)
    detailed = analyze_detailed_resume(resume)

    assert canonical.estimated_years == 0.3
    assert detailed.total_experience_years == canonical.estimated_years
    assert detailed.seniority_level == canonical.seniority_level
    python_context = next(
        item for item in detailed.all_extracted_skills
        if item.skill.lower() == "python" and item.section == "experience"
    )
    assert python_context.duration_months == 4


def test_detailed_sections_ignore_contact_portfolio_and_summary_phrases():
    resume = """
Candidate Name
GitHub | Portfolio | LinkedIn

PROFESSIONAL SUMMARY
Entry-level engineer with internship experience building ML systems.

TECHNICAL SKILLS
Python, TensorFlow

INTERNSHIP EXPERIENCE
AI/ML Intern
Nov 2024 - Feb 2025
Built TensorFlow models.

PERSONAL PROJECTS
RAG Assistant
Built a Python retrieval application.

EDUCATION
Bachelor of Technology

CERTIFICATIONS & ADDITIONAL TRAINING
Machine Learning Certificate
"""

    detailed = analyze_detailed_resume(resume)
    project_skills = {
        item.skill.lower()
        for item in detailed.all_extracted_skills
        if item.section == "projects"
    }

    assert "python" in project_skills
    assert detailed.sections.projects is not None
    assert "RAG Assistant" in detailed.sections.projects
