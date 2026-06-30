# RecruitIQ — Smart Resume Screening System

A full-stack resume screening tool combining semantic AI scoring with explainable keyword analysis.

---

## Architecture

```
resume-pro/
├── backend/          FastAPI + Python AI engine
│   ├── app/
│   │   ├── api.py                  Main FastAPI app + routes
│   │   ├── core/
│   │   │   ├── text_extraction.py  PDF/DOCX/TXT parsing (PyMuPDF)
│   │   │   ├── nlp_utils.py        spaCy cleaning, synonym map, fuzzy matching
│   │   │   ├── embedding.py        Sentence-transformer embeddings (cached)
│   │   │   ├── caching.py          Disk cache (diskcache + MD5 hashing)
│   │   │   ├── scoring.py          4-component hybrid scorer
│   │   │   └── recommendations.py  Templated skill recommendations
│   │   └── models/schemas.py       Pydantic response models
│   ├── main.py                     Uvicorn entry point
│   └── requirements.txt
└── frontend/         React + Vite UI
    ├── src/
    │   ├── pages/
    │   │   ├── HubPage.jsx         Upload + JD input (Screen 1)
    │   │   ├── ResultsPage.jsx     Detailed analysis (Screen 2)
    │   │   ├── BulkPage.jsx        Multi-resume ranking (Screen 3)
    │   │   └── SettingsPage.jsx    Weight config (Screen 4)
    │   ├── components/
    │   │   ├── ScoreRing.jsx       Animated SVG score gauge
    │   │   ├── SkillsCloud.jsx     Matched/missing skill tags
    │   │   ├── ScoreBreakdown.jsx  Per-component progress bars
    │   │   ├── UploadZone.jsx      Drag-and-drop file upload
    │   │   └── Topnav.jsx          Sticky navigation bar
    │   ├── utils/api.js            Backend API calls
    │   ├── App.jsx                 Router + shared state
    │   ├── main.jsx                React entry
    │   └── index.css               Design system (CSS variables)
    ├── package.json
    ├── vite.config.js
    └── index.html
```

---

## Scoring Engine

Four components fused into a single weighted score:

| Component        | Weight | Method                                      |
|------------------|--------|---------------------------------------------|
| Semantic match   | 40%    | `all-MiniLM-L6-v2` cosine similarity        |
| BM25 keyword     | 25%    | BM25Okapi sparse retrieval                  |
| TF-IDF           | 15%    | sklearn TF-IDF cosine similarity            |
| Skill coverage   | 20%    | Fuzzy + synonym + substring keyword match   |

**Keyword extraction** is fully dynamic (no hardcoded list) — tech tokens (`Node.js`, `C++`), acronyms (`SQL`, `AWS`), and proper noun phrases are extracted from the JD and matched against the resume with:
- Direct substring matching
- Synonym normalisation (50+ pairs: `JS ↔ JavaScript`, `k8s ↔ Kubernetes`, etc.)
- Fuzzy matching (SequenceMatcher ≥ 0.86 threshold)

All embeddings and BM25 objects are disk-cached by MD5 hash for fast re-runs.

---

## Setup

### Prerequisites
- Python 3.10+
- Node.js 18+

### Backend

```bash
cd backend

# Create virtual environment
python -m venv venv
source venv/bin/activate          # Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Download spaCy model
python -m spacy download en_core_web_sm

# Start the server
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

The API will be available at `http://localhost:8000`.  
Interactive docs: `http://localhost:8000/docs`

### Frontend

```bash
cd frontend

# Install dependencies
npm install

# Start dev server (proxies /api → localhost:8000)
npm run dev
```

Open `http://localhost:5173` in your browser.

---

## API Reference

### `POST /api/analyze`

**Multipart form fields:**

| Field             | Type   | Description                  |
|-------------------|--------|------------------------------|
| `resume`          | File   | PDF, DOCX, or TXT (max 10MB) |
| `job_description` | string | Full job description text    |

**Response JSON:**

```json
{
  "match_percentage": 74.3,
  "dense_score": 81.2,
  "bm25_score": 68.5,
  "tfidf_score": 70.1,
  "keyword_coverage": 60.0,
  "matched_skills": ["Python", "FastAPI", "Docker"],
  "missing_skills": ["Kubernetes", "Terraform"],
  "total_keywords": 5,
  "recommendations": ["Add a project demonstrating hands-on experience with \"Kubernetes\"."],
  "resume_filename": "john_doe_cv.pdf",
  "resume_preview": "John Doe\nSoftware Engineer…"
}
```

### `GET /api/health`

Returns `{"status": "ok"}`.

---

## Screens

| Screen              | Route      | Description                              |
|---------------------|------------|------------------------------------------|
| Screening Hub       | `/`        | Upload resume + paste JD, run analysis   |
| Match Analysis      | `/results` | Score ring, skills cloud, recommendations|
| Bulk Compare        | `/bulk`    | Multi-resume ranking table + CSV export  |
| Settings            | `/settings`| Adjust component weights + max keywords  |

---

## Production Build

```bash
# Frontend
cd frontend && npm run build    # outputs to frontend/dist/

# Backend — serve with gunicorn for production
pip install gunicorn
gunicorn main:app -w 4 -k uvicorn.workers.UvicornWorker --bind 0.0.0.0:8000
```

---

## Tech Stack

**Backend:** FastAPI · Uvicorn · spaCy · Sentence-Transformers · BM25Okapi · scikit-learn · PyMuPDF · python-docx · diskcache · Pydantic

**Frontend:** React 18 · Vite · React Router · react-dropzone · Recharts · Lucide React
