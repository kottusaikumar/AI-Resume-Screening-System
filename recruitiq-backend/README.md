# RecruitIQ backend

FastAPI service for NeuralRecruit. Resume processing and scoring run inside
this service; it does not call an external AI or LLM inference API.
Text-based PDFs use native extraction; scanned PDF pages automatically fall
back to the bundled local OCR runtime.

## Local setup

Requirements: Python 3.11 and `uv`.

```powershell
cd recruitiq-backend
python -m venv .venv
uv pip install --python .\.venv\Scripts\python.exe -r requirements.txt -r requirements-dev.txt
Copy-Item .env.example .env
.\.venv\Scripts\python.exe main.py
```

The API starts at `http://127.0.0.1:8000`. In development, API documentation
is available at `http://127.0.0.1:8000/docs`.

The default local account is:

- Email: `admin@localhost`
- Password: `local-dev-change-me`

Change the bootstrap password and set a stable `AUTH_SECRET` before using real
candidate data. Production mode refuses to start with unsafe defaults.

## Verification

```powershell
.\.venv\Scripts\python.exe -m pytest --basetemp C:\tmp\recruitiq-pytest
```

## Security model

- Short-lived JWT bearer authentication
- Admin, recruiter, and reviewer roles
- Organization-scoped data access
- Argon2 password hashing
- Upload signature, size, and ZIP-safety checks
- Rate limits, explicit CORS, trusted hosts, and security headers
- Resume previews disabled by default
- Blind screening enabled by default
- Human review required for all screening results

## Comparison endpoints

- `POST /api/analyze/bulk`: multiple resumes against one job description.
- `POST /api/analyze/roles`: one resume against multiple named job descriptions.

Both endpoints are recruiter/admin protected, enforce configured batch limits,
use the same organization-scoped scoring settings, and return advisory rankings.

SQLite is appropriate for the verified localhost build. A persistent managed
database and persistent file storage are required before a free hosted backend
can be treated as production.
