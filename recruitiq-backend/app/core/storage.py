"""SQLite persistence with migrations, tenant isolation, and audit records.

SQLite remains the zero-dependency localhost database. The API only accesses
records through organization-scoped functions so the same ownership model can
later be moved to PostgreSQL without changing endpoint behavior.
"""

import json
import sqlite3
import uuid
from collections import Counter
from contextlib import contextmanager
from datetime import datetime, timezone
from typing import Any, Iterator

from app.core import config


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


@contextmanager
def _conn() -> Iterator[sqlite3.Connection]:
    config.DATA_DIR.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(config.DATABASE_PATH, timeout=30)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA busy_timeout = 30000")
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def _columns(conn: sqlite3.Connection, table: str) -> set[str]:
    return {row["name"] for row in conn.execute(f"PRAGMA table_info({table})")}


def init_db() -> None:
    with _conn() as conn:
        conn.execute("PRAGMA journal_mode = WAL")
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS organizations (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                created_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS users (
                id TEXT PRIMARY KEY,
                email TEXT NOT NULL UNIQUE COLLATE NOCASE,
                password_hash TEXT NOT NULL,
                role TEXT NOT NULL CHECK(role IN ('admin','recruiter','reviewer')),
                organization_id TEXT NOT NULL REFERENCES organizations(id),
                is_active INTEGER NOT NULL DEFAULT 1,
                created_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS scans (
                report_id TEXT PRIMARY KEY,
                created_at TEXT NOT NULL,
                resume_filename TEXT NOT NULL,
                match_percentage REAL NOT NULL,
                match_label TEXT NOT NULL,
                retention_risk TEXT NOT NULL DEFAULT 'Not assessed',
                seniority_level TEXT NOT NULL,
                estimated_years REAL NOT NULL,
                missing_skills TEXT NOT NULL,
                result_json TEXT NOT NULL,
                organization_id TEXT,
                created_by TEXT
            );
            CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS organization_settings (
                organization_id TEXT NOT NULL REFERENCES organizations(id),
                key TEXT NOT NULL,
                value TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                updated_by TEXT,
                PRIMARY KEY (organization_id, key)
            );
            CREATE TABLE IF NOT EXISTS audit_log (
                id TEXT PRIMARY KEY,
                created_at TEXT NOT NULL,
                organization_id TEXT NOT NULL,
                user_id TEXT,
                action TEXT NOT NULL,
                resource_type TEXT NOT NULL,
                resource_id TEXT,
                details_json TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_audit_org_created
                ON audit_log(organization_id, created_at DESC);
            """
        )
        # Migrate databases created by v2 without destroying user history.
        scan_columns = _columns(conn, "scans")
        if "organization_id" not in scan_columns:
            conn.execute("ALTER TABLE scans ADD COLUMN organization_id TEXT")
        if "created_by" not in scan_columns:
            conn.execute("ALTER TABLE scans ADD COLUMN created_by TEXT")
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_scans_org_created "
            "ON scans(organization_id, created_at DESC)"
        )


def check_database() -> bool:
    try:
        with _conn() as conn:
            conn.execute("SELECT 1").fetchone()
        return True
    except sqlite3.Error:
        return False


def create_organization(name: str) -> str:
    organization_id = f"org_{uuid.uuid4().hex}"
    with _conn() as conn:
        conn.execute(
            "INSERT INTO organizations(id, name, created_at) VALUES (?, ?, ?)",
            (organization_id, name.strip(), _now()),
        )
    return organization_id


def create_user(email: str, password_hash: str, role: str, organization_id: str) -> dict:
    user_id = f"usr_{uuid.uuid4().hex}"
    with _conn() as conn:
        conn.execute(
            """INSERT INTO users
               (id, email, password_hash, role, organization_id, is_active, created_at)
               VALUES (?, ?, ?, ?, ?, 1, ?)""",
            (user_id, email.strip().lower(), password_hash, role, organization_id, _now()),
        )
    return get_user(user_id) or {}


def get_user(user_id: str) -> dict | None:
    with _conn() as conn:
        row = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
    return dict(row) if row else None


def get_user_by_email(email: str) -> dict | None:
    with _conn() as conn:
        row = conn.execute(
            "SELECT * FROM users WHERE email = ? COLLATE NOCASE", (email.strip(),)
        ).fetchone()
    return dict(row) if row else None


def list_users(organization_id: str) -> list[dict]:
    with _conn() as conn:
        rows = conn.execute(
            """SELECT id, email, role, is_active, created_at
               FROM users WHERE organization_id = ? ORDER BY created_at""",
            (organization_id,),
        ).fetchall()
    return [dict(row) for row in rows]


def assign_unowned_records(organization_id: str) -> None:
    """Assign pre-authentication v2 data to the first local organization."""
    with _conn() as conn:
        conn.execute(
            "UPDATE scans SET organization_id = ? WHERE organization_id IS NULL",
            (organization_id,),
        )
        legacy = conn.execute("SELECT key, value FROM settings").fetchall()
        for row in legacy:
            conn.execute(
                """INSERT OR IGNORE INTO organization_settings
                   (organization_id, key, value, updated_at, updated_by)
                   VALUES (?, ?, ?, ?, NULL)""",
                (organization_id, row["key"], row["value"], _now()),
            )


def audit(
    organization_id: str,
    user_id: str | None,
    action: str,
    resource_type: str,
    resource_id: str | None = None,
    details: dict | None = None,
) -> None:
    with _conn() as conn:
        conn.execute(
            """INSERT INTO audit_log
               (id, created_at, organization_id, user_id, action,
                resource_type, resource_id, details_json)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                f"aud_{uuid.uuid4().hex}", _now(), organization_id, user_id,
                action, resource_type, resource_id, json.dumps(details or {}),
            ),
        )


def save_scan(result: dict, organization_id: str, created_by: str) -> None:
    exp = result.get("experience_info") or {}
    stored_result = dict(result)
    if not config.STORE_RESUME_PREVIEW:
        stored_result["resume_preview"] = ""
    with _conn() as conn:
        conn.execute(
            """INSERT INTO scans
               (report_id, created_at, resume_filename, match_percentage,
                match_label, retention_risk, seniority_level, estimated_years,
                missing_skills, result_json, organization_id, created_by)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                result["report_id"], _now(), result["resume_filename"],
                result["match_percentage"], result["match_label"],
                "Not assessed", exp.get("seniority_level", "Unknown"),
                exp.get("estimated_years", 0.0), json.dumps(result.get("missing_skills", [])),
                json.dumps(stored_result), organization_id, created_by,
            ),
        )
    audit(organization_id, created_by, "scan.created", "scan", result["report_id"])


def list_scans(organization_id: str, limit: int = 50) -> list[dict]:
    limit = min(max(limit, 1), 200)
    with _conn() as conn:
        rows = conn.execute(
            """SELECT report_id, created_at, resume_filename, match_percentage,
                      match_label, retention_risk, seniority_level, estimated_years
               FROM scans WHERE organization_id = ?
               ORDER BY created_at DESC LIMIT ?""",
            (organization_id, limit),
        ).fetchall()
    scans = [dict(row) for row in rows]
    for scan in scans:
        scan["retention_risk"] = "Not assessed"
    return scans


def get_scan(report_id: str, organization_id: str) -> dict | None:
    with _conn() as conn:
        row = conn.execute(
            "SELECT result_json FROM scans WHERE report_id = ? AND organization_id = ?",
            (report_id, organization_id),
        ).fetchone()
    if not row:
        return None
    result = json.loads(row["result_json"])
    result["retention_risk"] = "Not assessed"
    return result


def delete_scan(report_id: str, organization_id: str, user_id: str) -> bool:
    with _conn() as conn:
        cursor = conn.execute(
            "DELETE FROM scans WHERE report_id = ? AND organization_id = ?",
            (report_id, organization_id),
        )
    if cursor.rowcount:
        audit(organization_id, user_id, "scan.deleted", "scan", report_id)
    return cursor.rowcount > 0


def clear_scans(organization_id: str, user_id: str) -> int:
    with _conn() as conn:
        cursor = conn.execute("DELETE FROM scans WHERE organization_id = ?", (organization_id,))
    audit(organization_id, user_id, "scan.cleared", "scan", details={"count": cursor.rowcount})
    return cursor.rowcount


def get_setting(organization_id: str, key: str, default: Any = None) -> Any:
    with _conn() as conn:
        row = conn.execute(
            "SELECT value FROM organization_settings WHERE organization_id = ? AND key = ?",
            (organization_id, key),
        ).fetchone()
    if not row:
        return default
    try:
        return json.loads(row["value"])
    except (json.JSONDecodeError, TypeError):
        return row["value"]


def set_setting(organization_id: str, key: str, value: Any, user_id: str) -> None:
    with _conn() as conn:
        conn.execute(
            """INSERT INTO organization_settings
               (organization_id, key, value, updated_at, updated_by)
               VALUES (?, ?, ?, ?, ?)
               ON CONFLICT(organization_id, key) DO UPDATE SET
                   value=excluded.value, updated_at=excluded.updated_at,
                   updated_by=excluded.updated_by""",
            (organization_id, key, json.dumps(value), _now(), user_id),
        )
    audit(organization_id, user_id, "settings.updated", "settings", key)


def compute_analytics(organization_id: str) -> dict:
    with _conn() as conn:
        rows = conn.execute(
            """SELECT match_percentage, match_label, seniority_level,
                      estimated_years, missing_skills, created_at
               FROM scans WHERE organization_id = ?""",
            (organization_id,),
        ).fetchall()
    total = len(rows)
    if not total:
        return {
            "total_scans": 0, "avg_match_percentage": 0.0,
            "avg_years_experience": 0.0, "match_label_distribution": {},
            "retention_risk_distribution": {}, "seniority_distribution": {},
            "top_missing_skills": [], "recent_scans_by_day": [],
        }
    missing: Counter[str] = Counter()
    days: Counter[str] = Counter()
    for row in rows:
        try:
            missing.update(json.loads(row["missing_skills"]))
        except (json.JSONDecodeError, TypeError):
            pass
        days[row["created_at"][:10]] += 1
    recent_days = sorted(days.items())[-14:]
    return {
        "total_scans": total,
        "avg_match_percentage": round(sum(r["match_percentage"] for r in rows) / total, 1),
        "avg_years_experience": round(sum(r["estimated_years"] for r in rows) / total, 1),
        "match_label_distribution": dict(Counter(r["match_label"] for r in rows)),
        "retention_risk_distribution": {},
        "seniority_distribution": dict(Counter(r["seniority_level"] for r in rows)),
        "top_missing_skills": [{"skill": s, "count": c} for s, c in missing.most_common(10)],
        "recent_scans_by_day": [{"date": day, "count": count} for day, count in recent_days],
    }
