from app.core.ats_compatibility import analyze_ats_compatibility
from app.models.schemas import ExperienceInfo, ResumeQuality, SectionAnalysis


def _complete_sections() -> SectionAnalysis:
    return SectionAnalysis(
        has_summary=True,
        has_experience=True,
        has_education=True,
        has_skills=True,
        has_projects=True,
        has_certifications=False,
        completeness_score=83.3,
    )


def test_complete_resume_gets_six_transparent_profiles():
    text = """Jane Candidate
jane@example.com | +1 555 123 4567 | linkedin.com/in/jane
SUMMARY
Software engineer focused on reliable services.
EXPERIENCE
Engineer | Example Co | Jan 2022 - Present
- Built an API that reduced latency by 35 percent.
- Improved deployment reliability across 12 services.
- Automated release checks for 4 teams.
EDUCATION
Bachelor of Technology | Example University | 2021
SKILLS
Python, FastAPI, SQL, Docker
PROJECTS
Created a monitoring dashboard.
"""
    quality = ResumeQuality(
        total_bullets=3,
        quantified_bullets=3,
        word_count=420,
        avg_bullet_length=9,
        ats_format_score=100,
        quality_score=90,
    )
    diagnostics, profiles = analyze_ats_compatibility(
        text,
        _complete_sections(),
        quality,
        ExperienceInfo(estimated_years=4.0, seniority_level="Mid-level"),
    )

    assert len(profiles) == 6
    assert {profile.key for profile in profiles} == {
        "workday",
        "taleo",
        "icims",
        "greenhouse",
        "lever",
        "successfactors",
    }
    assert all(profile.score >= 85 for profile in profiles)
    assert diagnostics == []


def test_sparse_resume_returns_prioritized_evidence_based_fixes():
    text = "Candidate profile with a short project description and no contact fields."
    quality = ResumeQuality(
        total_bullets=0,
        quantified_bullets=0,
        word_count=11,
        avg_bullet_length=0,
        ats_format_score=75,
        quality_score=20,
    )
    diagnostics, profiles = analyze_ats_compatibility(
        text,
        SectionAnalysis(completeness_score=0),
        quality,
        ExperienceInfo(estimated_years=0, seniority_level="Entry-level"),
    )

    assert diagnostics
    assert diagnostics[0].severity == "critical"
    assert {item.key for item in diagnostics}.issuperset(
        {"contact_email", "standard_sections", "dated_experience", "skills_section"}
    )
    assert all(profile.score < 50 for profile in profiles)
    assert all("official" not in profile.description.lower() for profile in profiles)
