from pathlib import Path
import io
import sqlite3
import zipfile

import fitz
import pytest
from fastapi.testclient import TestClient

from app.api import app, limiter
from app.core import config, storage
from app.core.auth import ensure_bootstrap_admin
from app.core import upload_security
from app.core.upload_security import UnsafeUploadError, validate_file_signature
from app.core.pii_redaction import redact_pii


@pytest.fixture()
def client(tmp_path: Path):
    limiter.reset()
    config.DATA_DIR = tmp_path
    config.DATABASE_PATH = tmp_path / "test.db"
    config.AUTH_SECRET = "test-secret-that-is-long-enough-for-hs256-signing"
    config.SHOWCASE_MODE = False
    with TestClient(app) as test_client:
        yield test_client


def _login(client: TestClient) -> dict[str, str]:
    response = client.post(
        "/api/auth/login",
        json={"email": "admin@localhost", "password": "local-dev-change-me"},
    )
    assert response.status_code == 200
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


def test_protected_routes_require_login(client: TestClient):
    assert client.get("/api/history").status_code == 401
    headers = _login(client)
    assert client.get("/api/history", headers=headers).status_code == 200


def test_showcase_access_uses_limited_recruiter_identity(client: TestClient):
    config.SHOWCASE_MODE = True
    response = client.post("/api/auth/showcase")
    assert response.status_code == 200
    payload = response.json()
    assert payload["access_token"]
    assert payload["user"]["role"] == "recruiter"
    assert payload["user"]["email"] == config.SHOWCASE_USER_EMAIL


def test_admin_can_create_user(client: TestClient):
    headers = _login(client)
    response = client.post(
        "/api/users",
        headers=headers,
        json={"email": "reviewer@example.com", "password": "a-secure-test-password", "role": "reviewer"},
    )
    assert response.status_code == 201
    assert response.json()["user"]["role"] == "reviewer"


def test_history_is_organization_scoped(client: TestClient):
    first_org = storage.get_user_by_email("admin@localhost")["organization_id"]
    other_org = storage.create_organization("Other")
    storage.save_scan(
        {
            "report_id": "RIQ-TEST0001", "resume_filename": "candidate.txt",
            "match_percentage": 80, "match_label": "Strong Match",
            "retention_risk": "Not assessed", "missing_skills": [],
            "experience_info": {}, "resume_preview": "private",
        },
        other_org,
        "other-user",
    )
    assert storage.get_scan("RIQ-TEST0001", first_org) is None
    assert storage.get_scan("RIQ-TEST0001", other_org)["resume_preview"] == ""


def test_upload_signature_validation():
    validate_file_signature(b"%PDF-1.7\n", ".pdf")
    validate_file_signature(b"plain utf-8 resume", ".txt")
    with pytest.raises(UnsafeUploadError):
        validate_file_signature(b"not a pdf", ".pdf")
    with pytest.raises(UnsafeUploadError):
        validate_file_signature(b"binary\x00data", ".txt")


def test_docx_expansion_requires_absolute_and_ratio_limits(monkeypatch):
    archive_bytes = io.BytesIO()
    with zipfile.ZipFile(archive_bytes, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        archive.writestr("[Content_Types].xml", "<Types />")
        archive.writestr("word/document.xml", "A" * 200)
    monkeypatch.setattr(upload_security, "MAX_DOCX_UNCOMPRESSED_BYTES", 100)

    with pytest.raises(UnsafeUploadError, match="expands beyond"):
        validate_file_signature(archive_bytes.getvalue(), ".docx")


def test_lightweight_blind_screening_redacts_name_and_labeled_location():
    redacted = redact_pii(
        "Kottu Sai Kumar\nLocation: Hyderabad, India\nSUMMARY\nBackend engineer"
    )

    assert "Kottu Sai Kumar" not in redacted
    assert "Hyderabad" not in redacted
    assert "[REDACTED]" in redacted
    assert "[LOCATION]" in redacted


def test_resume_review_does_not_require_or_invent_job_match(client: TestClient):
    headers = _login(client)
    resume = b"""
    SUMMARY
    Data analyst with 4 years of experience building business reporting.

    SKILLS
    Python, SQL, Excel, Power BI, Tableau, statistics, pandas

    EXPERIENCE
    Data Analyst | Example Company | 2021 - Present
    - Built 12 reporting dashboards and reduced reporting time by 35%.
    - Automated weekly analysis using Python and SQL.

    EDUCATION
    Bachelor of Technology, 2021

    PROJECTS
    Customer retention dashboard using Power BI.
    """
    response = client.post(
        "/api/review-resume",
        headers=headers,
        files={"resume": ("candidate.txt", resume, "text/plain")},
        data={"blind_mode": "true"},
    )
    assert response.status_code == 200
    result = response.json()
    assert result["review_type"] == "resume_review"
    assert result["job_match_assessed"] is False
    assert "match_percentage" not in result
    assert result["section_analysis"]["has_skills"] is True
    assert any(skill.lower() == "python" for skill in result["extracted_skills"])
    assert result["suggested_roles"]


def test_resume_review_labels_project_evidence_without_inventing_work_history(
    client: TestClient,
):
    headers = _login(client)
    resume = b"""
    SUMMARY
    Entry-level data analyst focused on dashboard reporting and data cleaning.

    SKILLS
    Python, SQL, Excel, Power BI, Tableau, pandas

    PROJECTS
    Sales Dashboard
    - Cleaned a 9,000-row sales dataset and removed duplicate records.
    - Built an interactive Power BI dashboard for sales reporting.
    - Identified top-performing products and regional revenue trends.
    - Automated recurring data preparation with Python and SQL.

    EDUCATION
    Master of Computer Applications, 2023
    """
    response = client.post(
        "/api/review-resume",
        headers=headers,
        files={"resume": ("candidate.txt", resume, "text/plain")},
        data={"blind_mode": "true"},
    )
    assert response.status_code == 200
    result = response.json()
    assert result["experience_info"]["estimated_years"] == 0.0
    assert "no dated professional work history detected" in result["review_summary"]
    assert (
        "Project bullets make consistent use of action-oriented language."
        in result["strengths"]
    )
    assert not any(item.startswith("Experience bullets") for item in result["strengths"])


def test_resume_review_accepts_browser_ocr_for_validated_pdf(client: TestClient):
    headers = _login(client)
    document = fitz.open()
    document.new_page()
    pdf_bytes = document.tobytes()
    document.close()
    browser_text = """
    SUMMARY
    Data analyst with four years of reporting experience.
    SKILLS
    Python, SQL, Power BI, Tableau, pandas, statistics
    EXPERIENCE
    Data Analyst, Example Company, 2021 to Present.
    EDUCATION
    Bachelor of Technology
    """

    response = client.post(
        "/api/review-resume",
        headers=headers,
        files={"resume": ("scanned-candidate.pdf", pdf_bytes, "application/pdf")},
        data={"blind_mode": "true", "browser_extracted_text": browser_text},
    )

    assert response.status_code == 200
    result = response.json()
    assert result["resume_filename"] == "scanned-candidate.pdf"
    assert any(skill.lower() == "python" for skill in result["extracted_skills"])


def test_resume_review_recovers_missing_ocr_summary_without_inventing_experience(
    client: TestClient,
):
    headers = _login(client)
    document = fitz.open()
    document.new_page()
    pdf_bytes = document.tobytes()
    document.close()
    browser_text = """
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

    response = client.post(
        "/api/review-resume",
        headers=headers,
        files={"resume": ("scanned-candidate.pdf", pdf_bytes, "application/pdf")},
        data={"blind_mode": "false", "browser_extracted_text": browser_text},
    )

    assert response.status_code == 200
    sections = response.json()["section_analysis"]
    assert sections["has_summary"] is True
    assert sections["has_experience"] is False


def test_resume_review_recovers_explicit_merged_ocr_section_headings(
    client: TestClient,
):
    headers = _login(client)
    document = fitz.open()
    document.new_page()
    pdf_bytes = document.tobytes()
    document.close()
    browser_text = """
    Mohith Kopuri
    mohith@example.com
    Motivated Computer Science graduate with a strong foundation in data science
    and machine learning. Experienced with large datasets and predictive models.
    Seeking an opportunity to contribute and grow in a professional environment.
    EDUCATION PERSONAL PROJECTS
    Bachelor of Technology Course Completion Predictor
    SKILLS Enabled proactive interventions for students
    Python, SQL, Pandas, TensorFlow
    CERTIFICATIONS using Python
    Artificial Intelligence certificate
    """

    response = client.post(
        "/api/review-resume",
        headers=headers,
        files={"resume": ("two-column-scan.pdf", pdf_bytes, "application/pdf")},
        data={"blind_mode": "false", "browser_extracted_text": browser_text},
    )

    assert response.status_code == 200
    sections = response.json()["section_analysis"]
    assert sections == {
        "has_summary": True,
        "has_experience": False,
        "has_education": True,
        "has_skills": True,
        "has_certifications": True,
        "has_projects": True,
        "completeness_score": pytest.approx(83.3),
    }


def test_multi_role_comparison_requires_valid_role_list(client: TestClient):
    headers = _login(client)
    invalid_json = client.post(
        "/api/analyze/roles",
        headers=headers,
        files={"resume": ("candidate.txt", b"Experienced Python engineer", "text/plain")},
        data={"roles_json": "not-json"},
    )
    assert invalid_json.status_code == 400

    one_role = client.post(
        "/api/analyze/roles",
        headers=headers,
        files={"resume": ("candidate.txt", b"Experienced Python engineer", "text/plain")},
        data={
            "roles_json": (
                '[{"title":"Backend Engineer",'
                '"description":"Build and maintain production Python backend services."}]'
            )
        },
    )
    assert one_role.status_code == 400
    assert one_role.json()["detail"] == "Add at least two job descriptions."


def test_multi_role_comparison_accepts_browser_ocr(client: TestClient):
    headers = _login(client)
    document = fitz.open()
    document.new_page()
    pdf_bytes = document.tobytes()
    document.close()
    roles = (
        '[{"title":"Backend Engineer",'
        '"description":"Build production Python FastAPI backend services and SQL APIs."},'
        '{"title":"Data Engineer",'
        '"description":"Build Python SQL data pipelines and production ETL systems."}]'
    )
    response = client.post(
        "/api/analyze/roles",
        headers=headers,
        files={"resume": ("scanned.pdf", pdf_bytes, "application/pdf")},
        data={
            "roles_json": roles,
            "browser_extracted_text": (
                "SUMMARY\nPython backend engineer\nSKILLS\nPython FastAPI SQL\n"
                "EXPERIENCE\nBackend Engineer\nJan 2024 - Dec 2025\n"
                "Built production Python APIs and SQL services."
            ),
        },
    )

    assert response.status_code == 200
    assert response.json()["total_roles"] == 2
    assert all(
        item["result"]["model_name"] == "Classical LSA Hybrid Scorer"
        for item in response.json()["roles"]
    )


def test_native_resume_text_limit_is_enforced(client: TestClient, monkeypatch):
    monkeypatch.setattr(config, "MAX_TEXT_FIELD_CHARS", 40)
    headers = _login(client)

    response = client.post(
        "/api/review-resume",
        headers=headers,
        files={
            "resume": (
                "oversized.txt",
                b"SUMMARY\n" + (b"A" * 100),
                "text/plain",
            )
        },
    )

    assert response.status_code == 400
    assert "too long" in response.json()["detail"].lower()


def test_health_returns_503_when_database_is_unavailable(client: TestClient, monkeypatch):
    monkeypatch.setattr(storage, "check_database", lambda: False)

    response = client.get("/api/health")

    assert response.status_code == 503
    assert response.json()["status"] == "degraded"


def test_legacy_database_migrates_without_losing_scans(tmp_path: Path):
    legacy_path = tmp_path / "legacy.db"
    with sqlite3.connect(legacy_path) as connection:
        connection.executescript(
            """
            CREATE TABLE scans (
                report_id TEXT PRIMARY KEY, created_at TEXT NOT NULL,
                resume_filename TEXT NOT NULL, match_percentage REAL NOT NULL,
                match_label TEXT NOT NULL, retention_risk TEXT NOT NULL,
                seniority_level TEXT NOT NULL, estimated_years REAL NOT NULL,
                missing_skills TEXT NOT NULL, result_json TEXT NOT NULL
            );
            CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
            INSERT INTO scans VALUES (
                'LEGACY', '2026-01-01T00:00:00Z', 'legacy.txt', 50,
                'Partial Match', 'Medium', 'Mid', 3, '[]', '{}'
            );
            """
        )
    config.DATA_DIR = tmp_path
    config.DATABASE_PATH = legacy_path
    storage.init_db()
    ensure_bootstrap_admin()
    with sqlite3.connect(legacy_path) as connection:
        columns = {row[1] for row in connection.execute("PRAGMA table_info(scans)")}
        assert {"organization_id", "created_by"}.issubset(columns)
        assert connection.execute("SELECT COUNT(*) FROM scans").fetchone()[0] == 1
        legacy_org = connection.execute(
            "SELECT organization_id FROM scans WHERE report_id = 'LEGACY'"
        ).fetchone()[0]
    assert storage.list_scans(legacy_org)[0]["retention_risk"] == "Not assessed"
    assert storage.get_scan("LEGACY", legacy_org)["retention_risk"] == "Not assessed"
