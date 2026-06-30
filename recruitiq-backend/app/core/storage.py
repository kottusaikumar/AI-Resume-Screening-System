"""
storage.py
----------
Lightweight SQLite persistence for RecruitIQ.

Stores:
- scans     : every completed /api/analyze run, including the full
              response JSON, so a past report can be reopened exactly
              as it looked the first time.
- settings  : key/value store for the configurable scoring weights.

No ORM — this app's storage needs are simple enough that raw sqlite3
(stdlib, no extra dependency) keeps things easy to reason about.
"""

import json
import os
import sqlite3
from collections import Counter
from contextlib import contextmanager
from datetime import datetime, timezone
from typing import Any, Optional

DB_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "data")
DB_PATH = os.path.join(DB_DIR, "recruitiq.db")


def _ensure_dir() -> None:
    os.makedirs(DB_DIR, exist_ok=True)


@contextmanager
def _conn():
    _ensure_dir()
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


def init_db() -> None:
    with _conn() as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS scans (
                report_id        TEXT PRIMARY KEY,
                created_at       TEXT NOT NULL,
                resume_filename  TEXT NOT NULL,
                match_percentage REAL NOT NULL,
                match_label      TEXT NOT NULL,
                retention_risk   TEXT NOT NULL,
                seniority_level  TEXT NOT NULL,
                estimated_years  REAL NOT NULL,
                missing_skills   TEXT NOT NULL,
                result_json       TEXT NOT NULL
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS settings (
                key   TEXT PRIMARY KEY,
                value TEXT NOT NULL
            )
            """
        )


# ---------------------------------------------------------------------------
# Scans / History
# ---------------------------------------------------------------------------
def save_scan(result: dict) -> None:
    exp = result.get("experience_info") or {}
    with _conn() as conn:
        conn.execute(
            """
            INSERT OR REPLACE INTO scans
                (report_id, created_at, resume_filename, match_percentage,
                 match_label, retention_risk, seniority_level, estimated_years,
                 missing_skills, result_json)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                result["report_id"],
                datetime.now(timezone.utc).isoformat(),
                result["resume_filename"],
                result["match_percentage"],
                result["match_label"],
                result["retention_risk"],
                exp.get("seniority_level", "Unknown"),
                exp.get("estimated_years", 0.0),
                json.dumps(result.get("missing_skills", [])),
                json.dumps(result),
            ),
        )


def list_scans(limit: int = 50) -> list[dict]:
    with _conn() as conn:
        rows = conn.execute(
            """
            SELECT report_id, created_at, resume_filename, match_percentage,
                   match_label, retention_risk, seniority_level, estimated_years
            FROM scans ORDER BY created_at DESC LIMIT ?
            """,
            (limit,),
        ).fetchall()
    return [dict(r) for r in rows]


def get_scan(report_id: str) -> Optional[dict]:
    with _conn() as conn:
        row = conn.execute(
            "SELECT result_json FROM scans WHERE report_id = ?", (report_id,)
        ).fetchone()
    if not row:
        return None
    return json.loads(row["result_json"])


def delete_scan(report_id: str) -> bool:
    with _conn() as conn:
        cur = conn.execute("DELETE FROM scans WHERE report_id = ?", (report_id,))
    return cur.rowcount > 0


def clear_scans() -> int:
    with _conn() as conn:
        cur = conn.execute("DELETE FROM scans")
    return cur.rowcount


# ---------------------------------------------------------------------------
# Settings (scoring weights)
# ---------------------------------------------------------------------------
def get_setting(key: str, default: Any = None) -> Any:
    with _conn() as conn:
        row = conn.execute("SELECT value FROM settings WHERE key = ?", (key,)).fetchone()
    if not row:
        return default
    try:
        return json.loads(row["value"])
    except (json.JSONDecodeError, TypeError):
        return row["value"]


def set_setting(key: str, value: Any) -> None:
    with _conn() as conn:
        conn.execute(
            "INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)",
            (key, json.dumps(value)),
        )


# ---------------------------------------------------------------------------
# Analytics
# ---------------------------------------------------------------------------
def compute_analytics() -> dict:
    with _conn() as conn:
        rows = conn.execute(
            """
            SELECT match_percentage, match_label, retention_risk,
                   seniority_level, estimated_years, missing_skills, created_at
            FROM scans
            """
        ).fetchall()

    total = len(rows)
    if total == 0:
        return {
            "total_scans": 0,
            "avg_match_percentage": 0.0,
            "avg_years_experience": 0.0,
            "match_label_distribution": {},
            "retention_risk_distribution": {},
            "seniority_distribution": {},
            "top_missing_skills": [],
            "recent_scans_by_day": [],
        }

    avg_match = sum(r["match_percentage"] for r in rows) / total
    avg_years = sum(r["estimated_years"] for r in rows) / total

    label_dist = Counter(r["match_label"] for r in rows)
    risk_dist = Counter(r["retention_risk"] for r in rows)
    seniority_dist = Counter(r["seniority_level"] for r in rows)

    missing_counter: Counter = Counter()
    for r in rows:
        try:
            skills = json.loads(r["missing_skills"])
        except (json.JSONDecodeError, TypeError):
            skills = []
        missing_counter.update(skills)

    day_counter: Counter = Counter()
    for r in rows:
        day = r["created_at"][:10]  # YYYY-MM-DD
        day_counter[day] += 1
    recent_days = sorted(day_counter.items())[-14:]  # last 14 active days

    return {
        "total_scans": total,
        "avg_match_percentage": round(avg_match, 1),
        "avg_years_experience": round(avg_years, 1),
        "match_label_distribution": dict(label_dist),
        "retention_risk_distribution": dict(risk_dist),
        "seniority_distribution": dict(seniority_dist),
        "top_missing_skills": [
            {"skill": s, "count": c} for s, c in missing_counter.most_common(10)
        ],
        "recent_scans_by_day": [{"date": d, "count": c} for d, c in recent_days],
    }
