"""Deterministic, JD-independent resume review helpers."""

from app.models.schemas import (
    DetailedResumeAnalysis,
    ExperienceInfo,
    ResumeQuality,
    SectionAnalysis,
    SuggestedRole,
)


ROLE_FAMILIES: tuple[tuple[str, frozenset[str]], ...] = (
    (
        "Data Analyst",
        frozenset(
            {
                "sql",
                "excel",
                "power bi",
                "tableau",
                "data analysis",
                "data visualization",
                "statistics",
                "python",
            }
        ),
    ),
    (
        "Data Scientist",
        frozenset(
            {
                "python",
                "machine learning",
                "scikit-learn",
                "tensorflow",
                "pytorch",
                "statistics",
                "pandas",
                "numpy",
                "nlp",
            }
        ),
    ),
    (
        "Machine Learning Engineer",
        frozenset(
            {
                "python",
                "machine learning",
                "tensorflow",
                "pytorch",
                "mlops",
                "docker",
                "kubernetes",
                "aws",
                "azure",
                "gcp",
            }
        ),
    ),
    (
        "Backend Engineer",
        frozenset(
            {
                "python",
                "java",
                "c#",
                "node.js",
                "fastapi",
                "django",
                "spring boot",
                "sql",
                "postgresql",
                "mongodb",
                "rest api",
            }
        ),
    ),
    (
        "Frontend Engineer",
        frozenset(
            {
                "javascript",
                "typescript",
                "react",
                "angular",
                "vue",
                "html",
                "css",
                "tailwind",
                "next.js",
            }
        ),
    ),
    (
        "Cloud / DevOps Engineer",
        frozenset(
            {
                "aws",
                "azure",
                "gcp",
                "docker",
                "kubernetes",
                "terraform",
                "jenkins",
                "ci/cd",
                "linux",
                "devops",
            }
        ),
    ),
)


def _normalise_skill(skill: str) -> str:
    return " ".join(skill.lower().replace("_", " ").split())


def suggest_roles(skills: list[str], limit: int = 3) -> list[SuggestedRole]:
    """Return job-family suggestions backed only by skills present in the resume."""
    original_by_key: dict[str, str] = {}
    for skill in skills:
        key = _normalise_skill(skill)
        if key:
            original_by_key.setdefault(key, skill)

    ranked: list[SuggestedRole] = []
    for title, role_skills in ROLE_FAMILIES:
        matches = [
            original_by_key[key]
            for key in sorted(original_by_key)
            if key in role_skills
        ]
        if matches:
            ranked.append(
                SuggestedRole(
                    title=title,
                    matching_skills=matches[:6],
                    evidence_count=len(matches),
                )
            )
    ranked.sort(key=lambda role: (-role.evidence_count, role.title))
    return ranked[:limit]


def identify_strengths(
    sections: SectionAnalysis,
    quality: ResumeQuality,
    experience: ExperienceInfo,
    detailed: DetailedResumeAnalysis,
) -> list[str]:
    strengths: list[str] = []
    if quality.ats_format_score >= 85:
        strengths.append("The document is highly readable by conventional ATS parsers.")
    if sections.completeness_score >= 75:
        strengths.append("The resume covers most core recruiter-review sections.")
    if quality.quantified_bullets >= 3:
        strengths.append("Multiple achievements include measurable evidence.")
    if quality.action_verb_count >= 4:
        strengths.append("Experience bullets make consistent use of action-oriented language.")
    if len(detailed.sections.skills) >= 6:
        strengths.append("The resume provides a broad, explicitly stated skill set.")
    if experience.estimated_years >= 3:
        strengths.append("The work timeline provides meaningful experience evidence.")
    if sections.has_projects:
        strengths.append("Project evidence is available for recruiter review.")
    if not strengths:
        strengths.append("The document was parsed successfully into a structured recruiter review.")
    return strengths[:5]


def build_review_summary(
    sections: SectionAnalysis,
    quality: ResumeQuality,
    experience: ExperienceInfo,
    skill_count: int,
) -> str:
    return (
        f"The resume was parsed as a {experience.seniority_level.lower()} profile with "
        f"{experience.estimated_years:.1f} estimated years of dated experience and "
        f"{skill_count} explicitly detected skills. Core-section completeness is "
        f"{sections.completeness_score:.0f}% and ATS readability is "
        f"{quality.ats_format_score:.0f}%. These are resume-quality signals, not a "
        "job-match score."
    )
