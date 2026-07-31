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
from typing import List, Set, Tuple, Dict, Any, Optional
from app.core.nlp_utils import extract_skills_from_text, normalise, fuzzy_ratio, FUZZY_THRESHOLD
from app.models.schemas import SectionAnalysis, ResumeQuality, ExperienceInfo, SkillWithContext, JobRole, EducationEntry, ResumeSections, DetailedResumeAnalysis

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
SECTION_PATTERNS: Dict[str, re.Pattern] = {
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


_EXPERIENCE_HEADER_RE = re.compile(
    r"^\s*(?:"
    r"experience|professional\s+experience|work\s+experience|"
    r"relevant\s+experience|career\s+experience|internship\s+experience|"
    r"employment(?:\s+history)?|work\s+history|career\s+history|"
    r"professional\s+background|internships?"
    r")"
    r"(?:\s*(?:&|and|/)\s*internships?)?\s*:?\s*$",
    re.I,
)
_NON_EXPERIENCE_HEADER_RE = re.compile(
    r"^\s*(?:"
    r"professional\s+summary|summary|objective|profile|about\s+me|"
    r"education|academic(?:\s+background)?|qualifications?|"
    r"skills?|technical\s+skills?|core\s+competencies|"
    r"projects?|portfolio|"
    r"certifications?|certificates?|licenses?|credentials?|training|"
    r"awards?|achievements?|publications?|"
    r"leadership(?:\s+activities)?|activities|volunteering|"
    r"languages?|interests?|references?"
    r")\s*:?\s*$",
    re.I,
)
_WORK_CONTEXT_RE = re.compile(
    r"\b(?:"
    r"intern|engineer|developer|analyst|scientist|manager|consultant|"
    r"employment|experience|company|contract|freelance|position|role"
    r")\b",
    re.I,
)
_NON_WORK_CONTEXT_RE = re.compile(
    r"\b(?:education|university|college|school|degree|cgpa|gpa|"
    r"certification|certificate|issued|project|portfolio)\b",
    re.I,
)
_MONTH_WORD = (
    r"jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|"
    r"jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|"
    r"oct(?:ober)?|nov(?:ember)?|dec(?:ember)?"
)
_YEAR_TOKEN = r"(?:20\d{2}|19\d{2}|['\u2019]?\d{2})"
_DATE_SEPARATOR = r"(?:-|\u2013|\u2014|\u2212|\bto\b)"
_PRESENT_WORD = r"(?:present|current|now|ongoing|till\s+date|to\s+date)"
_MONTH_RANGE_RE = re.compile(
    rf"\b(?P<start_month>{_MONTH_WORD})\.?[\s,/-]+"
    rf"(?P<start_year>{_YEAR_TOKEN})\s*{_DATE_SEPARATOR}\s*"
    rf"(?:(?P<end_month>{_MONTH_WORD})\.?[\s,/-]+"
    rf"(?P<end_year>{_YEAR_TOKEN})|(?P<present>{_PRESENT_WORD}))\b",
    re.I,
)
_NUMERIC_MONTH_RANGE_RE = re.compile(
    rf"\b(?P<start_month>0?[1-9]|1[0-2])[/.-](?P<start_year>{_YEAR_TOKEN})"
    rf"\s*{_DATE_SEPARATOR}\s*"
    rf"(?:(?P<end_month>0?[1-9]|1[0-2])[/.-](?P<end_year>{_YEAR_TOKEN})"
    rf"|(?P<present>{_PRESENT_WORD}))\b",
    re.I,
)
_YEAR_FIRST_MONTH_RANGE_RE = re.compile(
    rf"\b(?P<start_year>20\d{{2}}|19\d{{2}})[/.-](?P<start_month>0?[1-9]|1[0-2])"
    rf"\s*{_DATE_SEPARATOR}\s*"
    rf"(?:(?P<end_year>20\d{{2}}|19\d{{2}})[/.-](?P<end_month>0?[1-9]|1[0-2])"
    rf"|(?P<present>{_PRESENT_WORD}))\b",
    re.I,
)
_EXPERIENCE_YEAR_RANGE_RE = re.compile(
    rf"\b(?P<start_year>20\d{{2}}|19\d{{2}})\s*{_DATE_SEPARATOR}\s*"
    rf"(?:(?P<end_year>20\d{{2}}|19\d{{2}})|(?P<present>{_PRESENT_WORD}))\b",
    re.I,
)
_STATED_DURATION_AFTER_CONTEXT_RE = re.compile(
    r"\b(?:internship|employment|experience|work(?:\s+experience)?|professional\s+experience)"
    r"\b[^\n]{0,80}?\b(?P<value>\d+(?:\.\d+)?)\s*"
    r"(?P<unit>months?|mos?|years?|yrs?)\b",
    re.I,
)
_STATED_DURATION_BEFORE_CONTEXT_RE = re.compile(
    r"\b(?P<value>\d+(?:\.\d+)?)\s*(?P<unit>months?|mos?|years?|yrs?)"
    r"\b[^\n]{0,40}?\b(?:of\s+)?(?:internship|employment|experience|work|professional)\b",
    re.I,
)


def _normalize_extracted_date_text(text: str) -> str:
    """
    Repair high-confidence spacing loss around month-year dates.

    PDF text layers often concatenate visually separate spans, for example
    ``Vajra.aiNOV 2024`` or ``NOV2024``. Only insert spaces when a recognized
    month token is immediately followed by a plausible year, which avoids
    changing ordinary words.
    """
    attached_month = re.compile(
        rf"(?<=[A-Za-z0-9.])(?=(?:{_MONTH_WORD})\.?[\s,/-]*{_YEAR_TOKEN}\b)",
        re.I,
    )
    missing_month_year_space = re.compile(
        rf"(?P<month>{_MONTH_WORD})\.?(?={_YEAR_TOKEN}\b)",
        re.I,
    )
    normalized = attached_month.sub(" ", text)
    return missing_month_year_space.sub(r"\g<month> ", normalized)


def _extract_experience_scope(text: str) -> str:
    """
    Return text that belongs to explicit work-experience sections.

    If a resume has no section heading, use only date ranges with nearby job
    context. This conservative fallback is preferable to treating education,
    certification, or project dates as employment.
    """
    lines = text.splitlines()
    scoped_lines: List[str] = []
    in_experience = False
    found_header = False

    for line in lines:
        stripped = line.strip()
        if _EXPERIENCE_HEADER_RE.fullmatch(stripped):
            in_experience = True
            found_header = True
            continue
        if in_experience and _NON_EXPERIENCE_HEADER_RE.fullmatch(stripped):
            in_experience = False
            continue
        if in_experience:
            scoped_lines.append(line)

    if found_header:
        return "\n".join(scoped_lines)

    fallback_lines: List[str] = []
    range_patterns = (
        _MONTH_RANGE_RE,
        _NUMERIC_MONTH_RANGE_RE,
        _YEAR_FIRST_MONTH_RANGE_RE,
        _EXPERIENCE_YEAR_RANGE_RE,
    )
    for index, line in enumerate(lines):
        if not any(pattern.search(line) for pattern in range_patterns):
            continue
        context = " ".join(lines[max(0, index - 2):index + 1])
        if _WORK_CONTEXT_RE.search(context) and not _NON_WORK_CONTEXT_RE.search(context):
            fallback_lines.append(context)

    return "\n".join(fallback_lines)


def _month_number(value: str) -> int:
    if value.isdigit():
        return int(value)
    return {
        "jan": 1,
        "feb": 2,
        "mar": 3,
        "apr": 4,
        "may": 5,
        "jun": 6,
        "jul": 7,
        "aug": 8,
        "sep": 9,
        "oct": 10,
        "nov": 11,
        "dec": 12,
    }[value[:3].lower()]


def _four_digit_year(value: str, current_year: int) -> int:
    cleaned = value.strip("'’")
    if len(cleaned) == 4:
        return int(cleaned)
    short_year = int(cleaned)
    current_short_year = current_year % 100
    return 2000 + short_year if short_year <= current_short_year + 1 else 1900 + short_year


def _month_index(year: int, month: int) -> int:
    return year * 12 + month - 1


def _extract_stated_experience_months(text: str) -> List[int]:
    """Return explicit professional durations such as 'internship (6 months)'."""
    durations: List[int] = []
    for pattern in (
        _STATED_DURATION_AFTER_CONTEXT_RE,
        _STATED_DURATION_BEFORE_CONTEXT_RE,
    ):
        for match in pattern.finditer(text):
            value = float(match.group("value"))
            unit = match.group("unit").lower()
            months = round(value * 12) if unit.startswith(("year", "yr")) else round(value)
            if 0 < months <= 600:
                durations.append(months)
    return durations


def _extract_experience_intervals(
    experience_text: str,
    today: Optional[datetime.date] = None,
) -> List[Tuple[int, int]]:
    """Extract half-open month intervals from work-history date ranges."""
    today = today or datetime.date.today()
    experience_text = _normalize_extracted_date_text(experience_text)
    intervals: List[Tuple[int, int]] = []
    occupied_spans: List[Tuple[int, int]] = []

    def overlaps_existing(start: int, end: int) -> bool:
        return any(start < used_end and end > used_start for used_start, used_end in occupied_spans)

    for pattern in (
        _MONTH_RANGE_RE,
        _NUMERIC_MONTH_RANGE_RE,
        _YEAR_FIRST_MONTH_RANGE_RE,
    ):
        for match in pattern.finditer(experience_text):
            if overlaps_existing(*match.span()):
                continue
            start_year = _four_digit_year(match.group("start_year"), today.year)
            start_month = _month_number(match.group("start_month"))
            if match.group("present"):
                end_year, end_month = today.year, today.month
            else:
                end_year = _four_digit_year(match.group("end_year"), today.year)
                end_month = _month_number(match.group("end_month"))

            if start_year > today.year + 1 or end_year > today.year + 1:
                continue
            start_index = _month_index(start_year, start_month)
            end_index = _month_index(end_year, end_month) + 1
            if end_index <= start_index:
                continue
            intervals.append((start_index, end_index))
            occupied_spans.append(match.span())

    for match in _EXPERIENCE_YEAR_RANGE_RE.finditer(experience_text):
        if overlaps_existing(*match.span()):
            continue
        start_year = int(match.group("start_year"))
        if match.group("present"):
            end_year = today.year
            end_index = _month_index(today.year, today.month) + 1
        else:
            end_year = int(match.group("end_year"))
            end_index = _month_index(end_year, 1)

        if start_year > today.year + 1 or end_year > today.year + 1:
            continue
        start_index = _month_index(start_year, 1)
        if end_index <= start_index:
            # With year-only dates, a same-year role has unknown month
            # precision. Count one year rather than inventing exact months.
            end_index = start_index + 12
        intervals.append((start_index, end_index))
        occupied_spans.append(match.span())

    return intervals


def _merged_month_count(intervals: List[Tuple[int, int]]) -> int:
    """Merge overlapping/adjacent employment intervals and count each month once."""
    if not intervals:
        return 0

    merged: List[List[int]] = []
    for start, end in sorted(intervals):
        if not merged or start > merged[-1][1]:
            merged.append([start, end])
        else:
            merged[-1][1] = max(merged[-1][1], end)
    return sum(end - start for start, end in merged)


def estimate_experience(text: str) -> ExperienceInfo:
    """
    Estimate dated work experience from employment intervals only.

    Month-level ranges are inclusive (Jul-Sep is three months). Overlapping
    roles are merged so concurrent employment is not double-counted. Dates in
    education, certification, project, and other non-work sections are ignored.
    """
    normalized_text = _normalize_extracted_date_text(text)
    experience_text = _extract_experience_scope(normalized_text)
    total_months = _merged_month_count(
        _extract_experience_intervals(experience_text)
    )
    stated_durations = _extract_stated_experience_months(normalized_text)
    corroborating_durations = [
        months for months in stated_durations
        if abs(months - total_months) <= 1
    ]
    if corroborating_durations:
        # Month/year labels cannot reveal the exact start and end days. Prefer
        # an explicit stated duration when it agrees within that one-month
        # precision window.
        total_months = min(
            corroborating_durations,
            key=lambda months: abs(months - total_months),
        )
    if total_months == 0:
        return ExperienceInfo(estimated_years=0.0, seniority_level="Entry-level")

    total_yrs = total_months / 12.0

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
def _extract_sections_raw(text: str) -> Dict[str, str]:
    """Extract raw text content for each major resume section."""
    section_starts: Dict[str, int] = {}
    section_ends: Dict[str, int] = {}
    text_lower = text.lower()

    # Find start of each section
    for section_name, pattern in SECTION_PATTERNS.items():
        match = pattern.search(text_lower)
        if match:
            section_starts[section_name] = match.start()

    # Determine end of each section (start of next section, or end of document)
    sorted_starts = sorted(section_starts.items(), key=lambda item: item[1])
    for i, (section_name, start_idx) in enumerate(sorted_starts):
        if i + 1 < len(sorted_starts):
            section_ends[section_name] = sorted_starts[i + 1][1]
        else:
            section_ends[section_name] = len(text)

    extracted_sections: Dict[str, str] = {}
    for section_name, start_idx in section_starts.items():
        end_idx = section_ends[section_name]
        extracted_sections[section_name] = text[start_idx:end_idx].strip()

    return extracted_sections

def analyze_sections(text: str) -> SectionAnalysis:
    extracted_sections = _extract_sections_raw(text)
    found = {k: bool(v) for k, v in extracted_sections.items()}
    present = sum(found.values())
    completeness = round((present / len(SECTION_PATTERNS)) * 100, 1)
    return SectionAnalysis(
        has_summary=found.get("summary", False),
        has_experience=found.get("experience", False),
        has_education=found.get("education", False),
        has_skills=found.get("skills", False),
        has_certifications=found.get("certifications", False),
        has_projects=found.get("projects", False),
        completeness_score=completeness,
    )

def _parse_dates(text: str) -> Tuple[Optional[int], Optional[int], Optional[int]]:
    """Parses start year, end year, and duration in months from a text snippet."""
    intervals = _extract_experience_intervals(_normalize_extracted_date_text(text))
    if intervals:
        start_index = min(start for start, _ in intervals)
        end_index = max(end for _, end in intervals)
        return (
            start_index // 12,
            (end_index - 1) // 12,
            _merged_month_count(intervals),
        )

    start_year, end_year, duration_months = None, None, None
    current_year = datetime.datetime.now().year

    # Try to find year ranges like '2020 - 2023' or 'Jan 2020 - Present'
    year_range_match = YEAR_RANGE_RE.search(text)
    if year_range_match:
        y1_str = year_range_match.group(1)
        y2_str = year_range_match.group(2)
        start_year = int(y1_str)
        end_year = current_year if y2_str.lower() in ["present", "current", "now"] else int(y2_str)
    else:
        # Fallback: find individual years and assume latest two are start/end
        years = sorted([int(m) for m in DATE_YEAR_RE.findall(text) if 1900 <= int(m) <= current_year + 1])
        if len(years) >= 2:
            start_year = years[-2]
            end_year = years[-1]
        elif len(years) == 1:
            start_year = years[0]
            end_year = years[0] # Assume single year is both start and end for duration calc

    if start_year and end_year:
        duration_months = (end_year - start_year) * 12
        # Try to refine with month info if available
        month_year_matches = list(MONTH_YEAR_RE.finditer(text))
        if len(month_year_matches) >= 2:
            m1_str, y1_str = month_year_matches[-2].groups()
            m2_str, y2_str = month_year_matches[-1].groups()
            m1 = datetime.datetime.strptime(m1_str[:3], '%b').month
            m2 = datetime.datetime.strptime(m2_str[:3], '%b').month
            y1 = int(y1_str)
            y2 = int(y2_str)
            duration_months = (y2 - y1) * 12 + (m2 - m1)
        elif len(month_year_matches) == 1 and PRESENT_RE.search(text):
            m1_str, y1_str = month_year_matches[0].groups()
            m1 = datetime.datetime.strptime(m1_str[:3], '%b').month
            y1 = int(y1_str)
            today = datetime.date.today()
            duration_months = (today.year - y1) * 12 + (today.month - m1)

    return start_year, end_year, duration_months

def _parse_job_roles(experience_text: str) -> List[JobRole]:
    """Parses individual job roles from the experience section."""
    roles: List[JobRole] = []
    # Heuristic: split by common job title/company patterns or significant date changes
    # This is a simplified approach; a more robust parser would use NLP entity recognition
    # or rule-based systems with more context.
    job_delimiters = re.compile(r"\n\s*(?:[A-Z][A-Za-z\s&,-]+\s*\|\s*[A-Z][A-Za-z\s,-]+|\b(?:[A-Z][a-z]+(?:\s[A-Z][a-z]+)*)\b(?:\s*at\s*|\s*,\s*)[A-Z][a-z]+(?:\s[A-Z][a-z]+)*\b)", re.M)
    # Attempt to split by lines that look like new job titles or company names
    # This is a weak heuristic and will need refinement.
    segments = re.split(r"\n(?=[A-Z][^a-z]{2,}\s*\n|\n[A-Z][a-z]+(?:\s[A-Z][a-z]+)*\s*at\s*[A-Z][a-z]+)", experience_text)
    
    # Fallback to simpler line-based splitting if complex regex fails or is too aggressive
    if len(segments) < 2 and len(experience_text.splitlines()) > 5: # If not enough segments, try splitting by date ranges
        segments = re.split(r"\n(?=\s*(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec|20\d{2}|19\d{2})[\s\S]*?[–—\-–to]+\s*(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec|20\d{2}|19\d{2}|present|current|now))", experience_text)

    if len(segments) == 1 and len(experience_text.splitlines()) > 5: # If still one segment, split by double newline
        segments = experience_text.split("\n\n")

    for segment in segments:
        segment = segment.strip()
        if not segment: continue

        title, company, description = None, None, None
        start_date, end_date, duration = None, None, None

        # Extract dates first to help delimit roles
        s_year, e_year, d_months = _parse_dates(segment)
        start_date = str(s_year) if s_year else None
        end_date = str(e_year) if e_year else None
        duration = d_months

        lines = segment.splitlines()
        if not lines: continue

        # Heuristic for title and company: first few lines
        # This is highly dependent on resume format and needs robust NER for production
        if len(lines) > 0: title = lines[0].strip()
        if len(lines) > 1: company = lines[1].strip()
        
        # If title or company contain dates, they might be part of the description
        if title and (DATE_YEAR_RE.search(title) or MONTH_YEAR_RE.search(title)):
            description = title + (("\n" + company) if company else "") + "\n" + "\n".join(lines[2:])
            title = None
            company = None
        elif company and (DATE_YEAR_RE.search(company) or MONTH_YEAR_RE.search(company)):
            description = company + "\n" + "\n".join(lines[2:])
            company = None
        else:
            description = "\n".join(lines[2:])

        # Basic cleanup for title/company if they are too long or look like descriptions
        if title and len(title.split()) > 8 and not SECTION_PATTERNS["education"].search(title) and not SECTION_PATTERNS["skills"].search(title):
            description = (title + "\n" + (description or "")).strip()
            title = None
        if company and len(company.split()) > 8 and not SECTION_PATTERNS["education"].search(company) and not SECTION_PATTERNS["skills"].search(company):
            description = (company + "\n" + (description or "")).strip()
            company = None

        # Extract skills within this job role
        role_skills = extract_skills_from_text(segment)

        roles.append(JobRole(
            title=title,
            company=company,
            start_date=start_date,
            end_date=end_date,
            duration_months=duration,
            description=description.strip() if description else None,
            skills=role_skills
        ))
    return roles

def _parse_education_entries(education_text: str) -> List[EducationEntry]:
    """Parses individual education entries from the education section."""
    entries: List[EducationEntry] = []
    # Heuristic: split by lines that look like new degrees or institutions
    segments = re.split(r"\n(?=[A-Z][^a-z]{2,}\s*\n|\n(?:Bachelor|Master|PhD|Doctorate|Associate))", education_text)
    if len(segments) == 1 and len(education_text.splitlines()) > 5: # Fallback to simpler line-based splitting if complex regex fails
        segments = education_text.split("\n\n")

    for segment in segments:
        segment = segment.strip()
        if not segment: continue

        degree, institution, description = None, None, None
        start_date, end_date = None, None

        s_year, e_year, _ = _parse_dates(segment)
        start_date = str(s_year) if s_year else None
        end_date = str(e_year) if e_year else None

        lines = segment.splitlines()
        if not lines: continue

        # Heuristic for degree and institution: first few lines
        if len(lines) > 0: degree = lines[0].strip()
        if len(lines) > 1: institution = lines[1].strip()

        if degree and (DATE_YEAR_RE.search(degree) or MONTH_YEAR_RE.search(degree)):
            description = degree + (("\n" + institution) if institution else "") + "\n" + "\n".join(lines[2:])
            degree = None
            institution = None
        elif institution and (DATE_YEAR_RE.search(institution) or MONTH_YEAR_RE.search(institution)):
            description = institution + "\n" + "\n".join(lines[2:])
            institution = None
        else:
            description = "\n".join(lines[2:])

        entries.append(EducationEntry(
            degree=degree,
            institution=institution,
            start_date=start_date,
            end_date=end_date,
            description=description.strip() if description else None
        ))
    return entries

def analyze_detailed_resume(text: str) -> DetailedResumeAnalysis:
    """Performs a detailed analysis of resume sections, job roles, education, and skills with context."""
    extracted_raw_sections = _extract_sections_raw(text)
    canonical_experience = estimate_experience(text)
    
    resume_sections = ResumeSections(
        summary=extracted_raw_sections.get("summary"),
        projects=extracted_raw_sections.get("projects"),
        certifications=extracted_raw_sections.get("certifications"),
        other=None # Placeholder for other sections not explicitly defined
    )

    # Parse experience and education into structured objects
    experience_scope = _extract_experience_scope(_normalize_extracted_date_text(text))
    if experience_scope:
        extracted_raw_sections["experience"] = experience_scope
        resume_sections.experience = _parse_job_roles(experience_scope)
    if "education" in extracted_raw_sections:
        resume_sections.education = _parse_education_entries(extracted_raw_sections["education"])
    
    # Extract all skills with context
    all_extracted_skills: List[SkillWithContext] = []
    for section_name, content in extracted_raw_sections.items():
        skills_in_section = extract_skills_from_text(content)
        for skill in skills_in_section:
            start_year, end_year, duration_months = None, None, None
            if section_name == "experience":
                # Try to associate skill with a specific job role and its dates
                for job_role in resume_sections.experience:
                    role_text = " ".join(
                        part
                        for part in (job_role.title, job_role.company, job_role.description)
                        if part
                    )
                    if skill.lower() in role_text.lower():
                        start_year = int(job_role.start_date) if job_role.start_date else None
                        end_year = int(job_role.end_date) if job_role.end_date else None
                        duration_months = job_role.duration_months
                        break  # Associate with the first job role it's found in
            
            all_extracted_skills.append(SkillWithContext(
                skill=skill,
                section=section_name,
                start_year=start_year,
                end_year=end_year,
                duration_months=duration_months
            ))
    
    # Collect all unique skills found across the resume
    resume_sections.skills = list(set([s.skill for s in all_extracted_skills]))

    return DetailedResumeAnalysis(
        sections=resume_sections,
        all_extracted_skills=all_extracted_skills,
        total_experience_years=canonical_experience.estimated_years,
        seniority_level=canonical_experience.seniority_level,
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
