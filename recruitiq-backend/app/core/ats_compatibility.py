"""Deterministic resume-format diagnostics and ATS-oriented compatibility profiles.

The profiles in this module are transparent screening aids based on observable
document characteristics. They do not reproduce proprietary vendor algorithms
and must never be presented as official vendor scores.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

from app.models.schemas import (
    ATSCompatibilityProfile,
    ExperienceInfo,
    ResumeDiagnostic,
    ResumeQuality,
    SectionAnalysis,
)


EMAIL_RE = re.compile(r"\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b", re.I)
PHONE_RE = re.compile(r"(?<!\d)(?:\+?\d[\d ()-]{7,}\d)(?!\d)")
URL_RE = re.compile(r"\b(?:https?://|www\.|linkedin\.com/|github\.com/)", re.I)
DATE_RE = re.compile(
    r"\b(?:(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+)?"
    r"(?:19|20)\d{2}\b",
    re.I,
)
BROKEN_GLYPH_RE = re.compile(r"(?:\ufffd|â€|Ã.|\x00)")


@dataclass(frozen=True)
class _Signal:
    key: str
    category: str
    passed: bool
    severity: str
    title: str
    detail: str
    recommendation: str

    def as_diagnostic(self) -> ResumeDiagnostic:
        return ResumeDiagnostic(**self.__dict__)


PROFILE_DEFINITIONS: tuple[dict[str, object], ...] = (
    {
        "key": "workday",
        "name": "Workday-oriented",
        "description": "Emphasizes conventional headings, contact fields, chronology, and clean text extraction.",
        "weights": {"contact_email": 14, "contact_phone": 8, "standard_sections": 22, "skills_section": 12, "dated_experience": 18, "text_integrity": 14, "document_length": 12},
    },
    {
        "key": "taleo",
        "name": "Taleo-oriented",
        "description": "Emphasizes explicit skills, predictable section labels, dated work history, and readable bullets.",
        "weights": {"contact_email": 12, "standard_sections": 20, "skills_section": 20, "dated_experience": 18, "bullet_structure": 12, "text_integrity": 10, "document_length": 8},
    },
    {
        "key": "icims",
        "name": "iCIMS-oriented",
        "description": "Emphasizes searchable candidate fields, skills, education, chronology, and stable parsing.",
        "weights": {"contact_email": 12, "contact_phone": 8, "standard_sections": 18, "skills_section": 16, "education_section": 12, "dated_experience": 16, "text_integrity": 10, "document_length": 8},
    },
    {
        "key": "greenhouse",
        "name": "Greenhouse-oriented",
        "description": "Emphasizes readable evidence, conventional headings, concise bullets, and measurable achievements.",
        "weights": {"contact_email": 12, "standard_sections": 18, "bullet_structure": 20, "quantified_evidence": 16, "skills_section": 14, "text_integrity": 10, "document_length": 10},
    },
    {
        "key": "lever",
        "name": "Lever-oriented",
        "description": "Emphasizes clear contact data, lightweight structure, skills, and human-readable achievement bullets.",
        "weights": {"contact_email": 14, "contact_phone": 8, "standard_sections": 16, "bullet_structure": 18, "skills_section": 16, "quantified_evidence": 12, "text_integrity": 8, "document_length": 8},
    },
    {
        "key": "successfactors",
        "name": "SuccessFactors-oriented",
        "description": "Emphasizes structured profile fields, skills, education, dated experience, and reliable text extraction.",
        "weights": {"contact_email": 10, "contact_phone": 8, "standard_sections": 18, "skills_section": 16, "education_section": 14, "dated_experience": 16, "text_integrity": 10, "document_length": 8},
    },
)


def _label(score: float) -> str:
    if score >= 85:
        return "Strong compatibility"
    if score >= 70:
        return "Good compatibility"
    if score >= 50:
        return "Review recommended"
    return "High parsing risk"


def _build_signals(
    text: str,
    sections: SectionAnalysis,
    quality: ResumeQuality,
    experience: ExperienceInfo,
) -> dict[str, _Signal]:
    line_lengths = [len(line.strip()) for line in text.splitlines() if line.strip()]
    overly_long_lines = sum(length > 160 for length in line_lengths)
    broken_glyphs = len(BROKEN_GLYPH_RE.findall(text))
    standard_section_count = sum(
        (
            sections.has_summary,
            sections.has_experience,
            sections.has_education,
            sections.has_skills,
            sections.has_projects,
            sections.has_certifications,
        )
    )
    has_dates = bool(DATE_RE.search(text))

    return {
        "contact_email": _Signal(
            "contact_email", "Contact", bool(EMAIL_RE.search(text)), "critical",
            "Email address is readable",
            "A conventional email field helps parsers create a usable candidate record.",
            "Add a plain-text professional email near the top of the resume.",
        ),
        "contact_phone": _Signal(
            "contact_phone", "Contact", bool(PHONE_RE.search(text)), "important",
            "Phone number is readable",
            "A plain-text phone number is easier to map into candidate contact fields.",
            "Add a phone number as text rather than inside an image, icon, or header graphic.",
        ),
        "standard_sections": _Signal(
            "standard_sections", "Structure", standard_section_count >= 4, "critical",
            "Core sections use recognizable headings",
            f"{standard_section_count} of 6 review sections were detected.",
            "Use conventional headings such as Summary, Experience, Education, Skills, Projects, and Certifications.",
        ),
        "skills_section": _Signal(
            "skills_section", "Keywords", sections.has_skills, "important",
            "A dedicated skills section is detected",
            "Explicit skills are easier to retrieve than skills implied only by surrounding prose.",
            "Add a clearly labelled Skills or Technical Skills section containing only skills you can support with evidence.",
        ),
        "education_section": _Signal(
            "education_section", "Profile fields", sections.has_education, "important",
            "Education information is structured",
            "A recognizable education section improves field extraction.",
            "Use an Education heading and list degree, institution, and completion date as plain text.",
        ),
        "dated_experience": _Signal(
            "dated_experience", "Chronology",
            sections.has_experience and (experience.estimated_years > 0 or has_dates), "critical",
            "Work history includes readable dates",
            "Dated roles allow parsers and reviewers to reconstruct the employment timeline.",
            "Use a conventional Experience heading and consistent month/year ranges for each role.",
        ),
        "bullet_structure": _Signal(
            "bullet_structure", "Evidence", quality.total_bullets >= 3 and 5 <= quality.avg_bullet_length <= 40,
            "important", "Achievement bullets are parseable",
            f"{quality.total_bullets} bullets were detected with an average length of {quality.avg_bullet_length:.1f} words.",
            "Use concise plain-text bullets, ideally one achievement per bullet and about 8–30 words each.",
        ),
        "quantified_evidence": _Signal(
            "quantified_evidence", "Evidence", quality.quantified_bullets >= 2, "optional",
            "Measurable evidence is present",
            f"{quality.quantified_bullets} bullets include numbers or measurable outcomes.",
            "Where truthful, add scale, time, quality, revenue, accuracy, or performance outcomes to achievement bullets.",
        ),
        "text_integrity": _Signal(
            "text_integrity", "Parsing", broken_glyphs == 0 and overly_long_lines <= 2, "critical",
            "Extracted text is structurally stable",
            f"Detected {broken_glyphs} broken text markers and {overly_long_lines} unusually long extracted lines.",
            "Export a searchable, single-column PDF and verify that copied text reads in the correct order.",
        ),
        "document_length": _Signal(
            "document_length", "Length", 250 <= quality.word_count <= 1000, "optional",
            "Document length supports review",
            f"The extracted resume contains {quality.word_count} words.",
            "Keep the resume concise while retaining enough evidence—commonly about 300–900 words.",
        ),
    }


def analyze_ats_compatibility(
    text: str,
    sections: SectionAnalysis,
    quality: ResumeQuality,
    experience: ExperienceInfo,
) -> tuple[list[ResumeDiagnostic], list[ATSCompatibilityProfile]]:
    signals = _build_signals(text, sections, quality, experience)
    diagnostics = [
        signal.as_diagnostic()
        for signal in signals.values()
        if not signal.passed
    ]
    severity_rank = {"critical": 0, "important": 1, "optional": 2}
    diagnostics.sort(key=lambda item: (severity_rank.get(item.severity, 9), item.category, item.title))

    profiles: list[ATSCompatibilityProfile] = []
    for definition in PROFILE_DEFINITIONS:
        weights = definition["weights"]
        assert isinstance(weights, dict)
        total = sum(weights.values())
        earned = sum(weight for key, weight in weights.items() if signals[key].passed)
        profile_diagnostics = [
            signals[key].as_diagnostic()
            for key in weights
            if not signals[key].passed
        ]
        profile_diagnostics.sort(
            key=lambda item: (severity_rank.get(item.severity, 9), item.category, item.title)
        )
        score = round((earned / total) * 100, 1) if total else 0.0
        profiles.append(
            ATSCompatibilityProfile(
                key=str(definition["key"]),
                name=str(definition["name"]),
                score=score,
                label=_label(score),
                description=str(definition["description"]),
                checks_passed=len(weights) - len(profile_diagnostics),
                checks_total=len(weights),
                diagnostics=profile_diagnostics,
            )
        )

    return diagnostics, profiles
