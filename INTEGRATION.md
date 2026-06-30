# NeuralRecruit + RecruitIQ — Integration Guide

This package contains two projects, wired together:

```
neuralrecruit-frontend/   The NeuralRecruit UI (design preserved, now connected to live data)
recruitiq-backend/        The RecruitIQ FastAPI engine (extended with a few new fields)
```

The frontend's design, layout, colors, components, and navigation are **unchanged**.
Only its data source changed: the Upload → Analyzing → Results flow now calls the
real backend instead of using a fake timer and hardcoded numbers.

---

## 1. Run the backend

```bash
cd recruitiq-backend
pip install -r requirements.txt
python main.py
```

By default this starts the API at `http://localhost:8000`.
Health check: `GET http://localhost:8000/api/health`

## 2. Run the frontend

```bash
cd neuralrecruit-frontend
cp .env.example .env        # set VITE_API_URL and VITE_API_KEY (must match the backend's API_KEY)
npm install                 # or bun install
npm run dev                 # or bun run dev
```

The app will be available at the printed local URL (typically `http://localhost:3000`).

---

## What changed, and why (v3: security & production-readiness)

You asked to harden this for security/production-readiness, scoped to a
personal/demo project — so this stays proportionate: a simple shared API
key instead of a full user-account system, but real protection against
the gaps found in the earlier audit.

### Backend
- **`app/core/config.py`** *(new)* — centralizes every security-related
  setting, loaded from a `.env` file: `API_KEY`, `ALLOWED_ORIGINS`,
  `MAX_UPLOAD_MB`, `MAX_TEXT_FIELD_CHARS`, `ANALYZE_RATE_LIMIT`,
  `DEFAULT_RATE_LIMIT`, `LOG_LEVEL`. Every setting has a safe local-dev
  default, so the app still runs with zero `.env` setup — but everything
  is lockable before this is ever exposed beyond localhost.
- **API key auth** — every endpoint except `/api/health` now requires an
  `X-API-Key` header matching `API_KEY`, *if* `API_KEY` is set. Leave it
  blank to keep auth off for local-only use (the default).
- **CORS locked down** — `allow_origins=["*"]` is gone, replaced with an
  explicit allow-list (`ALLOWED_ORIGINS`) defaulting to common local dev
  ports.
- **Rate limiting** (via `slowapi`) — `/api/analyze` is limited to
  `ANALYZE_RATE_LIMIT` (default 10/minute per IP); every other endpoint
  gets `DEFAULT_RATE_LIMIT` (default 60/minute).
- **Real server-side upload size enforcement** — uploads are now streamed
  in 1MB chunks and aborted the moment they exceed `MAX_UPLOAD_MB`,
  instead of trusting the client or copying an unbounded file to disk
  first. Job description / mandatory-skills text fields are also capped
  (`MAX_TEXT_FIELD_CHARS`) to prevent oversized text payloads.
- **Logging** — startup, scan completions, settings changes, and history
  save failures are now logged (previously silent) via Python's
  `logging` module, configurable with `LOG_LEVEL`.
- **`main.py`** now actually reads `HOST`/`PORT` from `.env` (previously
  hardcoded, ignoring the file).

### Frontend
- **`src/lib/api.ts`** — every request now sends the `X-API-Key` header
  (when `VITE_API_KEY` is set), and PDF-download error handling now
  surfaces the real reason (e.g. "Invalid or missing API key" or "Too
  many requests") instead of a generic message.

### Verified
The full security logic (auth accept/reject, rate-limit threshold,
upload size accept/reject, public health check) was tested directly with
an isolated FastAPI TestClient harness — all 7 scenarios passed. The
heavy ML dependencies (sentence-transformers' model download requires
Hugging Face, unreachable in the sandbox this was built in) couldn't be
exercised end-to-end here, so test this for real in your own environment
once it's running.

### To use this
1. Generate a key: `python -c "import secrets; print(secrets.token_urlsafe(32))"`
2. Put it in `recruitiq-backend/.env` as `API_KEY=...`
3. Put the *same* value in `neuralrecruit-frontend/.env` as `VITE_API_KEY=...`
4. Set `ALLOWED_ORIGINS` in the backend `.env` to match wherever your
   frontend actually runs (check the URL Vite prints).
5. `pip install -r requirements.txt` again to pick up `slowapi` and
   `python-dotenv`.

If you skip steps 1–3, the app works exactly as before — auth is opt-in,
not required.

---

## What changed, and why (v2: full app pages)


This update adds working functionality behind every button and sidebar
link that previously did nothing — History, Skills DB, Analytics, Settings,
PDF export, CSV export, and Forward to Hiring Manager — while keeping
the original NeuralRecruit visual design fully intact.

### New pages (frontend)
- **History** (`/history`) — every scan you've run is now saved and
  listed here (filename, date, score, retention risk, seniority). Click
  "View Report" to reopen the exact original report. Includes per-row
  delete and a "Clear History" action.
- **Skills DB** (`/skills-db`) — the real taxonomy (~320 skills across 15
  categories) the matching engine uses to detect skills in resumes and
  job descriptions, with a live search/filter.
- **Analytics** (`/analytics`) — aggregate stats computed from your real
  scan history: total scans, average match score, average years of
  experience, match-label distribution, retention-risk distribution, and
  the most common skill gaps across every scan.
- **Settings** (`/settings`) — sliders to adjust how much weight the
  matching engine gives to each of its four scoring signals (semantic
  similarity, BM25 keyword overlap, TF-IDF similarity, skill keyword
  coverage). Saved weights apply to every scan from then on. Also
  includes a "Test Connection" check against the backend's health
  endpoint.

The sidebar and top-bar nav now use real client-side routing (so
History/Skills DB/Analytics/Settings are actual pages, not placeholders),
and "New Scan" works correctly from any page.

### Now-working buttons
- **PDF Report** — generates and downloads a real PDF of the report
  (via a new backend endpoint using `reportlab`). Works from both the
  live Results screen and from History.
- **Export** (top bar) — context-aware CSV download: the current report
  on the Scanner page, the full list on History, the skills list on
  Skills DB, or the summary stats on Analytics. Disabled (greyed out)
  on pages with nothing to export, like Settings.
- **Forward to Hiring Manager** — simulated per your request: shows a
  sending/sent confirmation in the UI. No email is actually sent, since
  no email service is connected.

### Backend additions
- **`app/core/storage.py`** *(new)* — lightweight SQLite persistence
  (stdlib `sqlite3`, no new dependency) for scan history and the
  scoring-weight settings. Database file lives at
  `recruitiq-backend/backend/data/recruitiq.db` (created automatically).
- **`app/core/pdf_report.py`** *(new)* — generates the downloadable PDF
  report using `reportlab` (added to `requirements.txt`).
- **`app/core/scoring.py`** — `calculate_match_score` now accepts an
  optional `weights` dict so scoring weights are configurable instead of
  hardcoded.
- **New endpoints in `app/api.py`**:
  - `GET/DELETE /api/history`, `GET/DELETE /api/history/{id}` — scan
    history.
  - `GET /api/history/{id}/pdf` — PDF for a past report.
  - `GET /api/skills` — the skills taxonomy, grouped by category.
  - `GET /api/analytics` — aggregate stats over scan history.
  - `GET/PUT /api/settings`, `POST /api/settings/reset` — scoring weights.
  - `POST /api/report/pdf` — PDF for the just-completed report (stateless,
    takes the report JSON directly).
  - `/api/analyze` now also saves every completed scan to history
    automatically (best-effort — a save failure never blocks the user's
    result).

No existing scoring, extraction, or recommendation logic was changed
beyond making the weights configurable.

---

## What changed, and why (v1)


### Frontend (`neuralrecruit-frontend`)
- **`src/lib/api.ts`** *(new)* — a small client that posts the resume file + job
  description to `POST /api/analyze` and types the response.
- **`src/routes/index.tsx`** *(updated)*:
  - Upload screen now validates file type/size client-side and shows a real
    error banner (wrong format, file too large, network/server errors) using
    the existing design system's `destructive` color tokens — no new colors
    introduced.
  - The "Analyzing" animation now plays while waiting for the real API
    response (instead of a fixed 4.2s fake timer), and transitions to
    Results only once real data has arrived.
  - The Results screen now renders real values everywhere data exists:
    match score, matched/missing skills, mandatory skill gaps, AI
    recommendations, resume quality, experience/seniority, and a short
    AI-generated alignment summary.
  - A few fields that had no backend equivalent ("Retention Risk", "Salary
    Fit", confidence, hiring funnel) are now backed by new backend logic
    (see below) rather than hardcoded numbers.

No visual/layout/component changes were made beyond what was required to
bind real data — same classes, same structure, same icons.

### Backend (`recruitiq-backend`)
- **`app/core/presentation.py`** *(new)* — computes the small set of extra
  fields the NeuralRecruit design needed that weren't already part of
  RecruitIQ's core scoring output:
  - `match_label` — "Exceptional / Strong / Partial / Limited Match", derived
    from the existing match percentage.
  - `retention_risk` — a coarse heuristic from experience + resume quality
    scores (explicitly a proxy signal, not a predictive model).
  - `required_years` — years of experience parsed from the job description
    text, if stated.
  - `salary_fit` — surfaces the salary range stated in the JD, if any
    (no salary expectation is collected from the candidate, so this reports
    what the JD says rather than fabricating a "fit" verdict).
  - `alignment_summary` / `alignment_gap` — short natural-language sentences
    generated from the real match score, matched skills, and skill gaps.
  - `funnel` — a simple two-state pipeline view (Screening Passed/Needs
    Review, with later stages always Pending) since a full ATS pipeline is
    out of scope.
  - `confidence` — a simple agreement score across the four scoring
    components (dense/BM25/TF-IDF/keyword).
  - `report_id`, `model_name`, `processing_time_seconds` — for the report
    metadata line in the UI header.
- **`app/models/schemas.py`** — added a `FunnelStage` model and the new
  fields above to `ScreeningResponse`.
- **`app/api.py`** — calls the new presentation helpers after the existing
  scoring/analysis pipeline runs, and includes them in the response.

No existing scoring, extraction, or recommendation logic was changed.

---

## Known limitations / things to revisit later

- **Retention Risk** and **Salary Fit** are heuristic/best-effort, not
  validated predictive signals — worth a label or tooltip in the UI
  clarifying this if used in real hiring decisions.
- The hiring **funnel** only reflects a pass/fail screening gate; later
  stages need a real ATS integration to be meaningful.
- The floating "MATCH: REACT.JS" / "CREDENTIAL: VERIFIED" chips on the
  Analyzing screen are still decorative placeholders (cosmetic animation),
  not tied to live extraction — left as-is since the request was to avoid
  unnecessary design changes, but they could be wired to the resume's actual
  top matched skills if desired.
