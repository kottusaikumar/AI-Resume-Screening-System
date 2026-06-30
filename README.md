# AI Resume Screening System

An AI-powered resume screening platform that analyzes resumes against job descriptions using NLP, semantic similarity, TF-IDF, BM25 ranking, and skill matching to help recruiters shortlist candidates efficiently.

## Demo

AI Resume Screening System automatically:
- Parses uploaded resumes (PDF/DOCX)
- Extracts candidate skills
- Compares resume with Job Description
- Calculates match score
- Detects missing skills
- Provides recommendations and analytics

---

## Features

- Resume Parsing (PDF / DOCX)
- Job Description Matching
- Semantic Similarity Scoring
- Skill Gap Detection
- Candidate Ranking
- Analytics Dashboard
- History Tracking
- PDF Report Generation

---

## Tech Stack

### Frontend
- React
- TypeScript
- Vite
- Tailwind CSS
- TanStack Router

### Backend
- Python
- FastAPI
- Uvicorn

### AI / NLP
- spaCy
- Sentence Transformers
- TF-IDF
- BM25
- Scikit-learn
- Cosine Similarity

---

## Project Structure

```bash
AI-Resume-Screening-System/
│
├── neuralrecruit-frontend/
│   ├── src/
│   ├── package.json
│   └── vite.config.ts
│
├── recruitiq-backend/
│   ├── app/
│   ├── main.py
│   └── requirements.txt
│
└── README.md
