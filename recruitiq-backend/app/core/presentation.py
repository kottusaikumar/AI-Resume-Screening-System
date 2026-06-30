"""
presentation.py
----------------
Derives the extra "presentation layer" fields required by the NeuralRecruit
frontend design from data the scoring/analysis pipeline already produces.

These are additive, best-effort computations layered on top of the core
hybrid score — they do not change how matching itself works.

Provides:
- match_label              -> "Exceptional Match" / "Strong Match" / ...
- retention_risk           -> "Low" / "Medium" / "High"
- required_years           -> years of experience requested by the JD (if stated)
- salary_fit               -> "In Range" / "Above Range" / "Below Range" / "Not specified"
- alignment_summary        -> short natural-language paragraph (JD vs resume)
- alignment_gap            -> short natural-language paragraph (biggest gap)
- funnel                    -> hiring pipeline stage list
- confidence                -> 0..1 confidence indicator
"""

import re
from typing import List, Optional

from app.models.schemas import ExperienceInfo, FunnelStage, ResumeQuality

# ---------------------------------------------------------------------------
# Match label
# ---------------------------------------------------------------------------
def compute_match_label(match_percentage: float) -> str:
    if match_percentage >= 85:
        return "Exceptional Match"
    if match_percentage >= 70:
        return "Strong Match"
    if match_percentage >= 50:
        return "Partial Match"
    return "Limited Match"


# ---------------------------------------------------------------------------
# Retention risk
# ---------------------------------------------------------------------------
def compute_retention_risk(
    experience_info: ExperienceInfo, resume_quality: ResumeQuality
) -> str:
    """
    Heuristic: candidates with more tenure history and a higher-quality,
    well-structured resume tend to be lower-risk hires. This is a coarse
    proxy signal, not a predictive model.
    """
    years_component = min(experience_info.estimated_years, 10.0) / 10.0 * 50.0
    quality_component = (resume_quality.quality_score / 100.0) * 50.0
    risk_score = years_component + quality_component

    if risk_score >= 60:
        return "Low"
    if risk_score >= 35:
        return "Medium"
    return "High"


# ---------------------------------------------------------------------------
# Required years (parsed from JD)
# ---------------------------------------------------------------------------
_YEARS_RE = re.compile(r"(\d{1,2})\s*\+?\s*(?:-|to)?\s*(?:\d{1,2}\s*)?\+?\s*years?", re.I)


def extract_required_years(jd_text: str) -> Optional[float]:
    matches = [int(m) for m in _YEARS_RE.findall(jd_text) if 0 < int(m) <= 20]
    if not matches:
        return None
    return float(max(matches))


# ---------------------------------------------------------------------------
# Salary fit (parsed from JD; "fit" is relative to typical market framing
# since no candidate salary expectation is collected)
# ---------------------------------------------------------------------------
_SALARY_RE = re.compile(
    r"[\$£€₹]\s?(\d{2,3})(?:[,.]?\d{3})?\s*(k|,000)?\s*(?:-|to|–|—)\s*"
    r"[\$£€₹]?\s?(\d{2,3})(?:[,.]?\d{3})?\s*(k|,000)?",
    re.I,
)


def extract_salary_range(jd_text: str) -> Optional[str]:
    m = _SALARY_RE.search(jd_text)
    if not m:
        return None
    lo, lo_suffix, hi, hi_suffix = m.groups()
    lo_val = int(lo) * (1000 if lo_suffix else 1)
    hi_val = int(hi) * (1000 if hi_suffix else 1)
    if lo_val < 1000:
        lo_val *= 1000
    if hi_val < 1000:
        hi_val *= 1000
    return f"${lo_val:,} - ${hi_val:,}"


def compute_salary_fit(jd_text: str) -> str:
    """
    Without a candidate salary expectation as input, we can't compute a true
    "fit". We surface what the JD states (if anything) so the UI slot is
    informative rather than fabricated.
    """
    salary_range = extract_salary_range(jd_text)
    if salary_range:
        return f"JD range: {salary_range}"
    return "Not specified"


# ---------------------------------------------------------------------------
# Alignment summary / gap narrative
# ---------------------------------------------------------------------------
def generate_alignment_summary(
    match_percentage: float,
    matched_skills: List[str],
    experience_info: ExperienceInfo,
) -> str:
    strength = compute_match_label(match_percentage).split(" ")[0].lower()  # exceptional/strong/partial/limited
    top_skills = matched_skills[:3]

    if top_skills:
        skills_clause = (
            f"with demonstrated strength in {', '.join(top_skills[:-1])}"
            f"{' and ' if len(top_skills) > 1 else ''}{top_skills[-1]}"
            if len(top_skills) > 1
            else f"with demonstrated strength in {top_skills[0]}"
        )
    else:
        skills_clause = "though few directly matching skills were detected"

    seniority = experience_info.seniority_level.lower()
    article = "an" if strength[0] in "aeiou" else "a"

    return (
        f"This resume shows {article} {strength} overall alignment "
        f"({match_percentage:.0f}% match) with the job description, "
        f"{skills_clause}. The candidate's profile reflects "
        f"{experience_info.estimated_years:.1f} years of experience, "
        f"consistent with a {seniority} profile."
    )


def generate_alignment_gap(
    mandatory_missing: List[str], missing_skills: List[str]
) -> Optional[str]:
    gap_skill = (mandatory_missing or missing_skills or [None])[0]
    if not gap_skill:
        return None
    severity = "a required skill the JD explicitly calls for" if mandatory_missing else "an area the JD emphasizes"
    return (
        f"A gap was identified in {gap_skill}, {severity}. "
        f"The resume does not show direct evidence of experience in this area — "
        f"consider probing this during screening."
    )


# ---------------------------------------------------------------------------
# Hiring funnel
# ---------------------------------------------------------------------------
def compute_funnel(match_percentage: float, mandatory_missing: List[str]) -> List[FunnelStage]:
    screening_passed = match_percentage >= 60 and not mandatory_missing
    return [
        FunnelStage(
            stage="Screening",
            status="Passed" if screening_passed else "Needs Review",
            done=screening_passed,
        ),
        FunnelStage(stage="Interview 1", status="Pending", done=False),
        FunnelStage(stage="Review", status="Pending", done=False),
        FunnelStage(stage="Offer", status="Pending", done=False),
    ]


# ---------------------------------------------------------------------------
# Confidence
# ---------------------------------------------------------------------------
def compute_confidence(
    dense_score: float, bm25_score: float, tfidf_score: float, keyword_coverage: float
) -> float:
    """
    A simple spread-based confidence indicator: when the four component
    scores agree closely, confidence is higher.
    """
    scores = [dense_score, bm25_score, tfidf_score, keyword_coverage]
    avg = sum(scores) / len(scores)
    spread = max(scores) - min(scores)
    # High spread -> lower confidence. Normalise spread (0-100) to a penalty.
    confidence = max(0.0, min(1.0, (avg / 100.0) - (spread / 200.0)))
    return round(confidence, 2)
