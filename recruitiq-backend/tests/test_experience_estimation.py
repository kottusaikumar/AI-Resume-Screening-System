import datetime

from app.core.resume_analyzer import (
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
