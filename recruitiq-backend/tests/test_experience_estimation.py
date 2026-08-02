import datetime

import pytest

from app.core.resume_analyzer import (
    analyze_sections,
    analyze_detailed_resume,
    _extract_experience_intervals,
    _merged_month_count,
    detect_ocr_section_hints,
    estimate_experience,
    restore_ocr_summary_heading,
)


def test_ocr_summary_fallback_restores_only_opening_narrative():
    ocr_text = """
Mohith Kopuri
mohith@example.com | github.com/mohith

Data science graduate with strong experience building machine learning and
analytics projects using Python, Pandas, SQL, and TensorFlow. Passionate about
turning complex datasets into clear insights and practical software solutions.

EDUCATION
Bachelor of Technology in Computer Science

SKILLS
Python, SQL, Pandas, TensorFlow

PROJECTS
Customer churn prediction platform
"""

    restored = restore_ocr_summary_heading(ocr_text)
    sections = analyze_sections(restored)

    assert "\nSUMMARY\n" in restored
    assert sections.has_summary is True
    assert sections.has_experience is False
    assert sections.has_education is True
    assert sections.has_skills is True
    assert sections.has_projects is True


def test_ocr_summary_fallback_accepts_merged_two_column_heading_boundary():
    ocr_text = """
4917095325479
MOHITH KOPURI mohithkopuriggmailcom
Hyderabad, Telangana
ee >) >.
Motivated and detail-driven Computer Science graduate with a strong foundation
in data science, machine learning, and statistical analysis. Experienced in
working with large datasets and developing predictive models using Python and
SQL. Seeking an opportunity to contribute in a professional environment.
EDUCATION PERSONAL PROJECTS
Narasaraopeta Institute of Technology Course Completion Predictor
2020-2024
SKILLS Enabled proactive interventions for students at risk
Python programming
CERTIFICATIONS using Python
Artificial Intelligence certificate
"""

    restored = restore_ocr_summary_heading(ocr_text)
    hints = detect_ocr_section_hints(restored)
    sections = analyze_sections(restored, inferred_sections=hints)

    assert "\nSUMMARY\nMotivated" in restored
    assert sections.has_summary is True
    assert sections.has_experience is False
    assert sections.has_education is True
    assert sections.has_skills is True
    assert sections.has_projects is True
    assert sections.has_certifications is True
    assert sections.completeness_score == pytest.approx(83.3)


def test_ocr_section_hints_do_not_treat_experienced_prose_as_experience():
    ocr_text = """
SUMMARY
Experienced in working with large datasets and predictive models.
EDUCATION PERSONAL PROJECTS
Bachelor of Technology
SKILLS Enabled proactive interventions for students
Python and SQL
CERTIFICATIONS using Python
Artificial Intelligence certificate
"""

    hints = detect_ocr_section_hints(ocr_text)

    assert hints == {"education", "skills", "projects", "certifications"}
    assert "experience" not in hints


@pytest.mark.parametrize(
    "ocr_text",
    [
        """
Mohith Kopuri
mohith@example.com
Python, SQL, Pandas, TensorFlow, Keras, HTML, CSS, MySQL
SKILLS
Python, SQL, Pandas
""",
        """
Mohith Kopuri
mohith@example.com
Built a machine learning project.
PROJECTS
Customer churn prediction
""",
        """
Mohith Kopuri
mohith@example.com
Experienced data analyst creating dashboards and predictive models for
business teams with Python and SQL. Skilled at communicating useful insights.
""",
    ],
)
def test_ocr_summary_fallback_rejects_weak_or_unbounded_opening_text(ocr_text):
    assert restore_ocr_summary_heading(ocr_text) == ocr_text


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
