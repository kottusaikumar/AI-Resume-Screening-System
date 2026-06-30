"""
resume_analyzer.py
------------------
Fixed version — handles all resume bullet formats and education-only
date filtering for accurate experience estimation.

Bugs fixed:
1. BULLET_RE — now catches ALL bullet styles: •, -, *, –, —, ▪, ►, ▸,
   ○, ●, ✓, ✔, numbered (1. 2.), AND plain lines starting with action verbs
2. Action verb detection — strips ALL leading punctuation/symbols before
   extracting first word, so "– Built..." correctly detects "built"
3. Experience estimation — separates EDUCATION years from WORK years so
   graduation year (2020/2024) doesn't inflate experience count
4. Seniority thresholds — tightened so fresh grads show Entry-level correctly
5. ATS format score — improved penalty logic
"""

import re
import datetime
from typing import List, Set
from app.models.schemas import SectionAnalysis, ResumeQuality, ExperienceInfo

# ---------------------------------------------------------------------------
# Action verbs — comprehensive list
# ---------------------------------------------------------------------------
ACTION_VERBS: Set[str] = {
    "achieved", "accelerated", "architected", "automated", "built", "championed",
    "collaborated", "conducted", "contributed", "created", "decreased", "delivered",
    "deployed", "designed", "developed", "directed", "drove", "eliminated",
    "engineered", "enhanced", "established", "executed", "expanded", "fine-tuned",
    "finetuned", "generated", "grew", "identified", "implemented", "improved",
    "increased", "integrated", "launched", "led", "managed", "mentored",
    "migrated", "modernised", "modernized", "optimised", "optimized",
    "orchestrated", "owned", "partnered", "performed", "pioneered", "produced",
    "reduced", "refactored", "resolved", "scaled", "shipped", "spearheaded",
    "standardised", "standardized", "streamlined", "trained", "transformed",
    "tuned", "upgraded", "validated", "wrote", "analyzed", "analysed",
    "applied", "assembled", "assessed", "built", "classified", "cleaned",
    "configured", "debugged", "documented", "evaluated", "extracted",
    "handled", "investigated", "maintained", "measured", "modelled", "modeled",
    "monitored", "parsed", "preprocessed", "prepared", "processed",
    "published", "researched", "reviewed", "served", "set", "tested",
    "visualized", "visualised",
}

# ---------------------------------------------------------------------------
# Section header patterns
# ---------------------------------------------------------------------------
SECTION_PATTERNS = {
    "summary":        re.compile(
        r"\b(summary|objective|profile|about\s*me|career\s*summary|professional\s*summary|overview)\b", re.I),
    "experience":     re.compile(
        r"\b(experience|employment|work\s*history|professional\s*experience|career\s*history|internship[s]?|positions?)\b", re.I),
    "education":      re.compile(
        r"\b(education|academic|degree|university|college|school|b\.?tech|m\.?tech|b\.?sc|m\.?sc|bachelor|master)\b", re.I),
    "skills":         re.compile(
        r"\b(skills?|technical\s*skills?|core\s*competencies|competencies|technologies|tools|stack)\b", re.I),
    "certifications": re.compile(
        r"\b(certifications?|certificates?|licen[sc]es?|credentials?|accreditations?|training)\b", re.I),
    "projects":       re.compile(
        r"\b(projects?|portfolio|open.?source|side.?projects?|personal\s*projects?)\b", re.I),
}

# ---------------------------------------------------------------------------
# FIX 1: Universal bullet pattern — catches ALL formats
# Handles: • - * – — ▪ ► ▸ ○ ● ✓ ✔ numbered lists, AND plain action-verb lines
# ---------------------------------------------------------------------------
# Symbol-prefixed bullets (any unicode bullet/dash/arrow)
_SYMBOL_BULLET = re.compile(
    r"^\s*"
    r"(?:[•\-\*\·▪▸►▶–—−‒―○●◦✓✔✗✘➤➢➣➜➝➞❖◆◇■□▷▹▻]|\d+[\.\)])\s+"
    r".{10,}",   # at least 10 chars of content
    re.M
)

# Plain lines that start directly with an action verb (no symbol) — min 8 words
_PLAIN_ACTION_BULLET = re.compile(
    r"^\s*(" + "|".join(sorted(ACTION_VERBS, key=len, reverse=True)) + r")\b.{20,}",
    re.I | re.M
)

def _extract_bullets(text: str) -> List[str]:
    """Extract all bullet lines using both patterns, deduplicated."""
    symbol_bullets = _SYMBOL_BULLET.findall(text)
    plain_bullets  = _PLAIN_ACTION_BULLET.findall(text)  # returns first group (verb)
    # For plain bullets get full lines
    plain_lines = _PLAIN_ACTION_BULLET.findall(text)
    # Re-extract full lines for plain bullets
    all_lines = text.splitlines()
    plain_full = []
    for line in all_lines:
        stripped = line.strip()
        if stripped and not _SYMBOL_BULLET.match(line):
            first = re.sub(r"[^a-zA-Z]", "", stripped.split()[0]).lower() if stripped.split() else ""
            if first in ACTION_VERBS and len(stripped.split()) >= 6:
                plain_full.append(stripped)

    combined = symbol_bullets + plain_full
    # Deduplicate preserving order
    seen = set()
    result = []
    for b in combined:
        key = b.strip()[:60]
        if key not in seen:
            seen.add(key)
            result.append(b)
    return result


# ---------------------------------------------------------------------------
# FIX 2: First word extraction — strips ALL leading symbols/punctuation
# ---------------------------------------------------------------------------
def _get_first_word(bullet_line: str) -> str:
    """
    Strip leading whitespace, bullet symbols, dashes, numbers, punctuation
    then return the first alphabetic word lowercased.
    Works for: "– Built...", "• Created...", "- Developed...", "1. Managed..."
    """
    # Remove leading whitespace + bullet symbols + numbering
    cleaned = re.sub(
        r"^[\s•\-\*\·▪▸►▶–—−‒―○●◦✓✔✗✘➤➢➣➜➝➞❖◆◇■□▷▹▻\d\.:\)\(]+",
        "", bullet_line
    ).strip()
    if not cleaned:
        return ""
    first = cleaned.split()[0]
    return re.sub(r"[^a-z]", "", first.lower())


# ---------------------------------------------------------------------------
# Quantification — numbers, %, $, x multipliers
# ---------------------------------------------------------------------------
QUANT_RE = re.compile(
    r"[\$£€₹]?\d[\d,\.]*\s*"
    r"(%|x|X|percent|k|K|M|B|million|billion|times|hrs?|hours?|days?|weeks?|months?|"
    r"users?|customers?|teams?|records?|images?|queries|requests?|ms|seconds?|"
    r"accuracy|r2|rmse|f1|params?|\+)?"
)

EMAIL_RE = re.compile(r"[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}")
TABLE_RE  = re.compile(r"\|.{3,}\|")  # pipe tables — ATS hostile

# ---------------------------------------------------------------------------
# FIX 3: Experience date extraction — separates EDUCATION dates from WORK dates
# ---------------------------------------------------------------------------
# Education section keywords — years within these blocks are EXCLUDED from work exp
EDUCATION_BLOCK_RE = re.compile(
    r"(education|b\.?tech|m\.?tech|bachelor|master|intermediate|college|university|school|cgpa|gpa|grade)\b",
    re.I
)

DATE_YEAR_RE = re.compile(r"\b(20\d{2}|19\d{2})\b", re.I)
MONTH_YEAR_RE = re.compile(
    r"\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*[\s,]+(20\d{2}|19\d{2})\b",
    re.I
)
PRESENT_RE = re.compile(r"\b(present|current|now|ongoing|till\s*date|to\s*date)\b", re.I)

# Year range pattern: "2022 – 2024" or "Nov 2024 — Feb 2025"
YEAR_RANGE_RE = re.compile(
    r"\b(20\d{2}|19\d{2})\s*[–—\-–to]+\s*(20\d{2}|19\d{2}|present|current|now)\b",
    re.I
)


def _is_education_line(line: str) -> bool:
    return bool(EDUCATION_BLOCK_RE.search(line))


def estimate_experience(text: str) -> ExperienceInfo:
    """
    Estimate WORK experience years only — filters out education date ranges.
    Strategy:
    1. Split text into lines
    2. Tag lines as education or work context
    3. Only collect years from work/internship/project context
    4. Use earliest work year → latest work year (or present) as span
    """
    current_year = datetime.datetime.now().year
    lines = text.splitlines()

    # Identify education section bounds
    in_education = False
    education_years: Set[int] = set()
    work_years: Set[int] = set()
    has_present = False

    # Pass 1: tag each line
    for line in lines:
        line_lower = line.lower()
        # Toggle education section
        if re.search(r"^\s*(education|academic background)", line, re.I):
            in_education = True
        elif re.search(r"^\s*(experience|internship|project|certif|skill|summary)", line, re.I):
            in_education = False

        # Check for present
        if PRESENT_RE.search(line):
            has_present = True

        # Extract years from this line
        line_years = [int(m) for m in DATE_YEAR_RE.findall(line)
                      if 1990 <= int(m) <= current_year + 1]

        if in_education or _is_education_line(line):
            education_years.update(line_years)
        else:
            work_years.update(line_years)

    # Work years = all detected years MINUS pure-education-only years
    # (years that appear in work context too are kept)
    pure_edu_only = education_years - work_years
    effective_work_years = work_years  # years found in non-education lines

    # Also check year ranges explicitly for internship/work markers
    work_context_re = re.compile(
        r"(intern|work|employ|position|role|project|freelance|contract|job)", re.I
    )
    for m in YEAR_RANGE_RE.finditer(text):
        # Find context around the match
        start = max(0, m.start() - 100)
        context = text[start:m.end() + 50]
        yr1 = int(m.group(1))
        yr2_str = m.group(2)
        if work_context_re.search(context) or not EDUCATION_BLOCK_RE.search(context):
            effective_work_years.add(yr1)
            if yr2_str.isdigit():
                effective_work_years.add(int(yr2_str))
            else:
                has_present = True

    if not effective_work_years:
        # Fallback: if no work years found, check if any internship dates exist
        for line in lines:
            if re.search(r"\b(intern|NOV|AUG|FEB|OCT)\b", line, re.I):
                for yr in DATE_YEAR_RE.findall(line):
                    y = int(yr)
                    if 2000 <= y <= current_year:
                        effective_work_years.add(y)

    if not effective_work_years:
        return ExperienceInfo(estimated_years=0.0, seniority_level="Entry-level")

    earliest_work = min(effective_work_years)
    latest_work   = current_year if has_present else max(effective_work_years)
    total_yrs     = max(0.0, float(latest_work - earliest_work))

    # FIX 4: Tighter seniority thresholds — fresh grads correctly show Entry-level
    if total_yrs < 2:
        level = "Entry-level"
    elif total_yrs < 5:
        level = "Mid-level"
    elif total_yrs < 9:
        level = "Senior"
    else:
        level = "Lead / Principal"

    return ExperienceInfo(
        estimated_years=round(total_yrs, 1),
        seniority_level=level,
    )


# ---------------------------------------------------------------------------
# 1. Section Analysis
# ---------------------------------------------------------------------------
def analyze_sections(text: str) -> SectionAnalysis:
    found = {k: bool(p.search(text)) for k, p in SECTION_PATTERNS.items()}
    present = sum(found.values())
    completeness = round((present / len(found)) * 100, 1)
    return SectionAnalysis(
        has_summary=found["summary"],
        has_experience=found["experience"],
        has_education=found["education"],
        has_skills=found["skills"],
        has_certifications=found["certifications"],
        has_projects=found["projects"],
        completeness_score=completeness,
    )


# ---------------------------------------------------------------------------
# 2. Resume Quality Score — uses fixed bullet extraction
# ---------------------------------------------------------------------------
def analyze_quality(text: str) -> ResumeQuality:
    words = text.split()
    word_count = len(words)

    bullets = _extract_bullets(text)
    total_bullets = len(bullets)
    quantified    = sum(1 for b in bullets if QUANT_RE.search(b))
    avg_len       = (sum(len(b.split()) for b in bullets) / total_bullets) if total_bullets else 0.0

    # FIX 2: Action verb count with correct first-word extraction
    action_count = 0
    for b in bullets:
        fw = _get_first_word(b)
        if fw in ACTION_VERBS:
            action_count += 1

    # ATS format score
    ats_penalties = 0
    if TABLE_RE.search(text):
        ats_penalties += 20
    if word_count < 150:
        ats_penalties += 15
    if not EMAIL_RE.search(text):
        ats_penalties += 10
    ats_format = max(0.0, 100.0 - ats_penalties)

    # Quality score
    action_ratio  = (action_count / total_bullets * 100) if total_bullets else 0
    quant_ratio   = (quantified   / total_bullets * 100) if total_bullets else 0
    length_ok     = 1.0 if 300 <= word_count <= 900 else 0.5 if word_count > 150 else 0.0
    quality_score = round(
        0.35 * action_ratio +
        0.35 * quant_ratio  +
        0.20 * ats_format   +
        0.10 * (length_ok * 100),
        1
    )

    return ResumeQuality(
        action_verb_count=action_count,
        quantified_bullets=quantified,
        total_bullets=total_bullets,
        word_count=word_count,
        avg_bullet_length=round(avg_len, 1),
        quality_score=min(quality_score, 100.0),
        ats_format_score=ats_format,
    )


# ---------------------------------------------------------------------------
# 4. Mandatory Skill Detection
# ---------------------------------------------------------------------------
MANDATORY_MARKERS_RE = re.compile(
    r"\b(must.?have|required|mandatory|essential|necessary|minimum\s*requirement|"
    r"must\s*possess|must\s*include|requirements?:)\b",
    re.I,
)

def detect_mandatory_skills(jd_text: str, missing_skills: List[str]) -> List[str]:
    mandatory_lines = [
        line.lower() for line in jd_text.splitlines()
        if MANDATORY_MARKERS_RE.search(line)
    ]
    if not mandatory_lines:
        return []
    mandatory_missing = []
    for skill in missing_skills:
        skill_lower = skill.lower()
        if any(skill_lower in line for line in mandatory_lines):
            mandatory_missing.append(skill)
    return mandatory_missing
