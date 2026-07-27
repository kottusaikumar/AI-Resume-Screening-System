# NeuralRecruit local integration

This workspace contains:

- `recruitiq-backend`: FastAPI, SQLite, local NLP/embedding and scoring
- `neuralrecruit-frontend`: React/TanStack Start application

No external AI or LLM inference API is used. The backend executes the local
spaCy and SentenceTransformer pipeline.

## Start locally

Backend:

```powershell
cd recruitiq-backend
Copy-Item .env.example .env
.\.venv\Scripts\python.exe main.py
```

Frontend, in a second terminal:

```powershell
cd neuralrecruit-frontend
bun install
bun run dev -- --host 127.0.0.1
```

Open `http://127.0.0.1:8080` and sign in with the development bootstrap account
shown on the login screen. The frontend stores the bearer token only in
`sessionStorage`; no shared API secret is embedded in browser code.

## Production checks

```powershell
cd neuralrecruit-frontend
bun run lint
bun run build

cd ..\recruitiq-backend
.\.venv\Scripts\python.exe -m pytest --basetemp C:\tmp\recruitiq-pytest
```

## Deployment boundary

The current phase is localhost verification. Before public deployment:

1. Configure a persistent hosted database and migrations.
2. Configure persistent private storage for uploaded documents, or avoid
   retaining uploads entirely.
3. Set unique production secrets, admin credentials, CORS origins, and hosts.
4. Add backup/restore, error monitoring, privacy policy, retention/deletion
   controls, and operational alerts.
5. Deploy the frontend and backend, then repeat authentication, upload, tenant
   isolation, and failure-recovery tests against the live URLs.

Screening scores are decision-support signals, not hiring decisions. The system
does not infer candidate retention and always requires human review.

## Match Lab workflows

The `/compare` workspace supports two structured comparison modes:

- Candidate shortlist: 2–10 resumes evaluated against one shared job description.
- Role portfolio: one resume evaluated against 2–10 named job descriptions.

Both modes apply blind screening by default, rank completed comparisons, expose
supporting skill and scoring evidence, report failed inputs separately, and
provide CSV export. Bulk comparison results are exploratory and are not saved
to history unless the API is explicitly called with `save_to_history=true`.
