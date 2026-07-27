from pathlib import Path
import sqlite3

import pytest
from fastapi.testclient import TestClient

from app.api import app
from app.core import config, storage
from app.core.auth import ensure_bootstrap_admin
from app.core.upload_security import UnsafeUploadError, validate_file_signature


@pytest.fixture()
def client(tmp_path: Path):
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
