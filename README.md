# NeuralRecruit

**Explainable resume intelligence and job-matching decision support for technical hiring.**

[Open the live application](https://neuralrecruit.vercel.app/) |
[Project information](https://neuralrecruit.vercel.app/about) |
[Backend health](https://neuralrecruit-api-kottu.onrender.com/api/health) |
[View the GitHub repository](https://github.com/kottusaikumar/AI-Resume-Screening-System)

NeuralRecruit helps HR teams review resumes, inspect candidate evidence, compare a
resume with a job description, and rank structured comparisons. It uses local,
open-source NLP and retrieval techniques; no paid or external LLM inference API is
required.

> NeuralRecruit is a decision-support showcase. Its scores are advisory evidence
> signals, not hiring decisions. Human review is always required.

## What it can do

- **Resume Review** - inspect ATS readability, structure, skills, experience
  evidence, resume quality, and suitable IT role families without a job
  description.
- **Job Match** - compare one resume with one job description using transparent
  lexical, semantic, skill, positional, experience, and quality signals.
- **Rank Candidates** - compare 2-10 resumes against one shared job description.
- **Compare Roles** - compare one resume against 2-10 named job descriptions.
- **Explain results** - show detected skills, missing evidence, section coverage,
  recommendations, and scoring components instead of a black-box verdict.
- **Read common formats** - process text-based PDF, DOCX, and TXT resumes, with
  lazy browser OCR for scanned PDFs in the public showcase.
- **Export evidence** - download structured comparison results as CSV.

## Live services

| Service | URL | Hosting |
| --- | --- | --- |
| Web application | [neuralrecruit.vercel.app](https://neuralrecruit.vercel.app/) | Vercel |
| API health | [neuralrecruit-api-kottu.onrender.com/api/health](https://neuralrecruit-api-kottu.onrender.com/api/health) | Render |

The Render free instance sleeps after inactivity, so the first analysis request
may take approximately 30-60 seconds while the backend wakes. Opening the landing
page and Resume Review workspace does not wake the backend; the API is contacted
only when the user starts an analysis.

## How it works

```text
Resume / Job Description
          |
          v
 Secure upload validation
          |
          v
 Text extraction + on-demand browser OCR
          |
          v
 Section, skill, date, and experience analysis
          |
          v
 TF-IDF / LSA + BM25 + deterministic scoring
          |
          v
 Explainable evidence report for human review
```

The production free-tier profile disables memory-heavy neural embeddings,
spaCy, and server-side OCR. It uses deterministic taxonomy matching,
TF-IDF/LSA, BM25, and rule-based NLP. Scanned PDF pages are read temporarily in
the user's browser before validated text is submitted to the API.

## Technology

### Frontend

- React 19 and TypeScript
- TanStack Start and TanStack Router
- Vite and Tailwind CSS
- PDF.js and Tesseract.js, loaded only when a scanned PDF is analyzed
- Radix UI and Lucide icons
- Deployed on Vercel

### Backend

- Python 3.11 and FastAPI
- Pydantic and Uvicorn
- scikit-learn, NumPy, and `rank_bm25`
- PyMuPDF and `python-docx`
- Optional RapidOCR and ONNX Runtime for non-showcase/local deployments
- SQLite for lightweight showcase data
- Deployed on Render

## Repository structure

```text
.
|-- neuralrecruit-frontend/   # React/TanStack Start web application
|-- recruitiq-backend/        # FastAPI analysis and reporting API
|-- render.yaml               # Render free-tier deployment blueprint
|-- DEPLOYMENT.md             # Vercel and Render deployment guide
`-- INTEGRATION.md            # Local integration and verification notes
```

## Run locally

### 1. Backend

```powershell
cd recruitiq-backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
Copy-Item .env.example .env
python main.py
```

The API runs at `http://127.0.0.1:8000`.

### 2. Frontend

Open a second terminal:

```powershell
cd neuralrecruit-frontend
bun install
Copy-Item .env.example .env
bun run dev -- --host 127.0.0.1
```

Open the local URL printed by Vite. The frontend uses
`VITE_API_URL=http://localhost:8000` by default.

## Quality checks

```powershell
cd neuralrecruit-frontend
bun run lint
bun run build

cd ..\recruitiq-backend
.\.venv\Scripts\python.exe -m pytest
```

GitHub Actions runs frontend lint/build checks, backend tests, and dependency
auditing for every push.

## Privacy and responsible use

- Candidate uploads are processed temporarily.
- Resume previews are disabled in the public showcase.
- Blind-screening support can redact identifying information before analysis.
- No external LLM inference API receives candidate documents.
- Results must be reviewed by a person before any hiring decision.
- Do not upload documents unless you have permission to process them.

## Deployment

See [DEPLOYMENT.md](DEPLOYMENT.md) for the complete free-tier Vercel and Render
configuration, environment variables, CORS settings, OCR limits, and production
smoke-test steps.
