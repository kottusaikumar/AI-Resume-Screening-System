"""
pdf_report.py
-------------
Generates a downloadable PDF version of a candidate match report.
Mirrors the sections shown on the NeuralRecruit Results screen.
"""

import io

from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.platypus import (
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

PRIMARY = colors.HexColor("#4f7cff")
SUCCESS = colors.HexColor("#1f9d6c")
WARNING = colors.HexColor("#b8860b")
MUTED = colors.HexColor("#6b7280")
DARK = colors.HexColor("#111827")


def _styles():
    styles = getSampleStyleSheet()
    styles.add(ParagraphStyle("ReportTitle", parent=styles["Title"], fontSize=22, textColor=DARK, spaceAfter=4))
    styles.add(ParagraphStyle("ReportMeta", parent=styles["Normal"], fontSize=8, textColor=MUTED, fontName="Courier"))
    styles.add(ParagraphStyle("SectionHeading", parent=styles["Heading2"], fontSize=13, textColor=DARK, spaceBefore=14, spaceAfter=6))
    styles.add(ParagraphStyle("Body", parent=styles["Normal"], fontSize=10, textColor=DARK, leading=15))
    styles.add(ParagraphStyle("MutedBody", parent=styles["Normal"], fontSize=9, textColor=MUTED, leading=13))
    return styles


def _skill_chip_table(skills: list[str], color, label_empty: str):
    if not skills:
        return Paragraph(label_empty, _styles()["MutedBody"])
    # Lay out skills in a wrapped grid of 4 columns.
    rows, row = [], []
    for i, s in enumerate(skills, 1):
        row.append(s)
        if i % 4 == 0:
            rows.append(row)
            row = []
    if row:
        rows.append(row + [""] * (4 - len(row)))
    t = Table(rows, colWidths=[1.6 * inch] * 4)
    t.setStyle(
        TableStyle(
            [
                ("FONTSIZE", (0, 0), (-1, -1), 8),
                ("TEXTCOLOR", (0, 0), (-1, -1), color),
                ("FONTNAME", (0, 0), (-1, -1), "Helvetica"),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
                ("TOPPADDING", (0, 0), (-1, -1), 4),
            ]
        )
    )
    return t


def generate_report_pdf(result: dict) -> bytes:
    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf, pagesize=letter,
        topMargin=0.6 * inch, bottomMargin=0.6 * inch,
        leftMargin=0.6 * inch, rightMargin=0.6 * inch,
    )
    styles = _styles()
    flow = []

    flow.append(Paragraph("Candidate Match Report", styles["ReportTitle"]))
    flow.append(
        Paragraph(
            f"REPORT_ID: {result.get('report_id', '—')} &nbsp;·&nbsp; "
            f"FILE: {result.get('resume_filename', '—')} &nbsp;·&nbsp; "
            f"MODEL: {result.get('model_name', '—')} &nbsp;·&nbsp; "
            f"{result.get('processing_time_seconds', 0):.2f}s",
            styles["ReportMeta"],
        )
    )
    flow.append(Spacer(1, 14))

    # Score summary table
    score_color = SUCCESS if result.get("match_percentage", 0) >= 70 else WARNING
    summary_rows = [
        ["Match Score", f"{result.get('match_percentage', 0):.0f}%  —  {result.get('match_label', '')}"],
        ["Retention Risk", result.get("retention_risk", "—")],
        ["Technical Fit", f"{result.get('dense_score', 0):.0f}%"],
        ["Years of Experience", f"{(result.get('experience_info') or {}).get('estimated_years', 0):.1f}"],
        ["Seniority Level", (result.get("experience_info") or {}).get("seniority_level", "—")],
        ["Salary Fit", result.get("salary_fit", "Not specified")],
        ["Resume Quality", f"{(result.get('resume_quality') or {}).get('quality_score', 0):.0f}%"],
        ["Confidence", f"{result.get('confidence', 0):.2f}"],
    ]
    t = Table(summary_rows, colWidths=[2.2 * inch, 3.8 * inch])
    t.setStyle(
        TableStyle(
            [
                ("FONTSIZE", (0, 0), (-1, -1), 10),
                ("TEXTCOLOR", (0, 0), (0, -1), MUTED),
                ("TEXTCOLOR", (1, 0), (1, -1), DARK),
                ("FONTNAME", (0, 0), (0, -1), "Helvetica"),
                ("FONTNAME", (1, 0), (1, -1), "Helvetica-Bold"),
                ("FONTNAME", (1, 0), (1, 0), "Helvetica-Bold"),
                ("TEXTCOLOR", (1, 0), (1, 0), score_color),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
                ("TOPPADDING", (0, 0), (-1, -1), 6),
                ("LINEBELOW", (0, 0), (-1, -2), 0.5, colors.HexColor("#e5e7eb")),
            ]
        )
    )
    flow.append(t)

    flow.append(Paragraph("JD vs Resume Alignment", styles["SectionHeading"]))
    flow.append(Paragraph(result.get("alignment_summary", ""), styles["Body"]))
    if result.get("alignment_gap"):
        flow.append(Spacer(1, 6))
        flow.append(Paragraph(result["alignment_gap"], styles["MutedBody"]))

    flow.append(Paragraph(f"Matched Skills ({len(result.get('matched_skills', []))})", styles["SectionHeading"]))
    flow.append(_skill_chip_table(result.get("matched_skills", []), SUCCESS, "No matched skills detected."))

    flow.append(Paragraph(f"Skill Gaps ({len(result.get('missing_skills', []))})", styles["SectionHeading"]))
    flow.append(_skill_chip_table(result.get("missing_skills", []), WARNING, "No skill gaps detected."))

    mandatory = result.get("mandatory_missing", [])
    if mandatory:
        flow.append(Spacer(1, 6))
        flow.append(
            Paragraph(
                f"<b>Critical Gap:</b> {', '.join(mandatory)} — marked as required for this role.",
                styles["MutedBody"],
            )
        )

    recs = result.get("recommendations", [])
    if recs:
        flow.append(Paragraph("AI Recommendations", styles["SectionHeading"]))
        for i, rec in enumerate(recs[:6], 1):
            flow.append(Paragraph(f"{i}. {rec}", styles["Body"]))
            flow.append(Spacer(1, 4))

    doc.build(flow)
    return buf.getvalue()
