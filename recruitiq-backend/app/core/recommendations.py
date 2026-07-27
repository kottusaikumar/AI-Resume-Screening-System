"""
recommendations.py
------------------
Enhanced recommendation engine combining:
- Missing skill suggestions (tool vs concept)
- Resume quality improvement tips (action verbs, quantification)
- Section completeness advice
- ATS format warnings
- Seniority-gap detection

Research basis: Jobscan / Resume Worded rubrics, IJNRD 2025 NLP study.
"""

import re
from typing import List

from app.core.nlp_utils import GENERIC_NOISE, STOPWORDS
from app.models.schemas import SectionAnalysis, ResumeQuality, ExperienceInfo

TECH_HINT_RE = re.compile(r"[+#./]|[0-9]")

TOOL_TEMPLATES = [
    'Add a project or bullet demonstrating hands-on experience with "{skill}".',
    'Mention "{skill}" explicitly in your Skills or Projects section.',
    'Consider earning a certification or completing a course in "{skill}".',
    'Include "{skill}" under your technical skills with a note on how you used it.',
    'If you have used "{skill}", add a concrete example with impact in your experience.',
]

CONCEPT_TEMPLATES = [
    'Highlight "{skill}" in a project description or your professional summary.',
    'If applicable, add a line describing your work related to "{skill}".',
    'Incorporate "{skill}" into your experience bullets with measurable outcomes.',
    'Consider adding a brief project that demonstrates your knowledge of "{skill}".',
    'Show evidence of "{skill}" — quantify it where possible (e.g. accuracy, scale).',
]

_SKIP_SKILLS = {
    "hands-on", "hands on", "cross-functional", "cross functional",
    "key responsibilities", "key responsibility", "nice to have",
    "analytical", "fast growing", "mission driven",
}


def _is_tool(skill_key: str) -> bool:
    if TECH_HINT_RE.search(skill_key):
        return True
    words = skill_key.split()
    return len(words) <= 2 and not any(w in STOPWORDS for w in words)


def generate_recommendations(
    missing_skills: List[str],
    section_analysis: SectionAnalysis = None,
    resume_quality: ResumeQuality = None,
    experience_info: ExperienceInfo = None,
    mandatory_missing: List[str] = None,
    limit: int = 12,
) -> List[str]:
    recs = []

    # 0. Dealbreaker mandatory skills first
    if mandatory_missing:
        for skill in mandatory_missing[:2]:
            recs.append(
                f'⚠️ CRITICAL: "{skill}" is listed as required in the JD — add it to your resume immediately.'
            )

    # 1. Missing skill recommendations
    count = 0
    for skill in missing_skills:
        if len(recs) >= limit:
            break
        skill = skill.strip()
        if not skill:
            continue
        if skill.lower() in _SKIP_SKILLS or skill.lower() in GENERIC_NOISE:
            continue
        if len(skill.split()) == 1 and len(skill) < 3:
            continue
        templates = TOOL_TEMPLATES if _is_tool(skill.lower()) else CONCEPT_TEMPLATES
        recs.append(templates[count % len(templates)].format(skill=skill))
        count += 1

    # 2. Section completeness tips
    if section_analysis:
        if not section_analysis.has_summary:
            recs.append("Add a 2–3 sentence Professional Summary at the top to immediately communicate your value to recruiters.")
        if not section_analysis.has_projects:
            recs.append("Add a Projects section — top ATS tools (Jobscan, Resume Worded) give bonus weight to demonstrated project work.")
        if not section_analysis.has_certifications:
            recs.append("Consider adding a Certifications section — even online certifications (Coursera, AWS, Google) boost ATS keyword coverage.")

    # 3. Resume quality tips
    if resume_quality:
        if resume_quality.quantified_bullets < 3:
            recs.append(
                f"Only {resume_quality.quantified_bullets} bullet point(s) contain numbers/metrics. "
                "Add quantified achievements (e.g. 'Reduced load time by 40%', 'Managed team of 6') — "
                "Resume Worded's scoring penalises unquantified bullets heavily."
            )
        if resume_quality.action_verb_count < 4:
            recs.append(
                "Start more bullet points with strong action verbs (e.g. 'Built', 'Deployed', 'Reduced', 'Led') "
                "— Jobscan and top ATS systems reward action-verb density."
            )
        if resume_quality.ats_format_score < 80:
            recs.append(
                "⚠️ ATS Format Issue: Your resume may contain tables or columns. "
                "Use plain single-column text — many ATS parsers (Workday, Taleo) fail to read multi-column layouts."
            )
        if resume_quality.word_count < 300:
            recs.append(
                f"Your resume is quite short ({resume_quality.word_count} words). "
                "Aim for 400–800 words to give ATS enough content to match against job descriptions."
            )
        elif resume_quality.word_count > 900:
            recs.append(
                f"Your resume is long ({resume_quality.word_count} words). "
                "Consider trimming to 1–2 pages to improve readability for human reviewers."
            )

    # 4. Experience seniority note
    if experience_info and experience_info.seniority_level not in ("Unknown", ""):
        if experience_info.estimated_years < 1:
            recs.append(
                "Your resume shows limited dated experience. "
                "Add internships, freelance work, or academic projects with date ranges to strengthen your timeline."
            )

    return recs[:limit]
