/**
 * api.ts
 * ------
 * Thin client for the RecruitIQ backend (FastAPI).
 *
 * Set VITE_API_URL in your .env to point at the backend, e.g.:
 *   VITE_API_URL=http://localhost:8000
 *
 * If unset, defaults to http://localhost:8000 (the backend's default dev port).
 *
 * If the backend has API_KEY set (see its .env.example), set the matching
 * VITE_API_KEY here too, or every request will get a 401.
 */

export interface SectionAnalysis {
  has_summary: boolean;
  has_experience: boolean;
  has_education: boolean;
  has_skills: boolean;
  has_certifications: boolean;
  has_projects: boolean;
  completeness_score: number;
}

export interface ResumeQuality {
  action_verb_count: number;
  quantified_bullets: number;
  total_bullets: number;
  word_count: number;
  avg_bullet_length: number;
  quality_score: number;
  ats_format_score: number;
}

export interface ExperienceInfo {
  estimated_years: number;
  seniority_level: string;
}

export interface FunnelStage {
  stage: string;
  status: string;
  done: boolean;
}

export interface ScreeningResult {
  // Core scores
  match_percentage: number;
  dense_score: number;
  bm25_score: number;
  tfidf_score: number;
  keyword_coverage: number;

  // Skills
  matched_skills: string[];
  missing_skills: string[];
  total_keywords: number;
  mandatory_missing: string[];

  // Resume analysis
  section_analysis?: SectionAnalysis | null;
  resume_quality?: ResumeQuality | null;
  experience_info?: ExperienceInfo | null;

  // Recommendations & meta
  recommendations: string[];
  resume_filename: string;
  resume_preview: string;

  // Presentation-layer fields
  match_label: string;
  retention_risk: string;
  required_years?: number | null;
  salary_fit: string;
  alignment_summary: string;
  alignment_gap?: string | null;
  funnel: FunnelStage[];
  confidence: number;
  report_id: string;
  model_name: string;
  processing_time_seconds: number;
}

export class ApiError extends Error {}

const API_BASE =
  (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, "") ||
  "http://localhost:8000";

const API_KEY = (import.meta.env.VITE_API_KEY as string | undefined) || "";

if (!API_KEY) {
  // eslint-disable-next-line no-console
  console.warn(
    "[RecruitIQ] VITE_API_KEY is not set. If the backend has API_KEY configured, " +
      "every request below will fail with 401 Unauthorized. Set VITE_API_KEY in " +
      "neuralrecruit-frontend/.env to match the backend's API_KEY, then restart `npm run dev`.",
  );
}

/** Merges the API key header (if configured) with any extra headers. */
function authHeaders(extra?: Record<string, string>): Record<string, string> {
  return API_KEY ? { "X-API-Key": API_KEY, ...extra } : { ...extra };
}

async function handleJsonResponse<T>(res: Response, fallbackMessage: string): Promise<T> {
  if (!res.ok) {
    let detail = fallbackMessage;
    try {
      const data = await res.json();
      if (typeof data?.detail === "string") detail = data.detail;
    } catch {
      // ignore JSON parse errors, fall back to default message
    }
    throw new ApiError(detail);
  }
  return res.json();
}

/**
 * Sends the resume file + job description to the RecruitIQ backend and
 * returns the full screening result used to populate the Results screen.
 */
export async function analyzeResume(
  file: File,
  jobDescription: string,
  mandatorySkills = "",
): Promise<ScreeningResult> {
  const form = new FormData();
  form.append("resume", file);
  form.append("job_description", jobDescription);
  if (mandatorySkills.trim()) form.append("mandatory_skills", mandatorySkills.trim());

  let res: Response;
  try {
    res = await fetch(`${API_BASE}/api/analyze`, {
      method: "POST",
      headers: authHeaders(),
      body: form,
    });
  } catch {
    throw new ApiError(
      "Couldn't reach the analysis server. Check your connection and that the backend is running.",
    );
  }

  return handleJsonResponse<ScreeningResult>(
    res,
    "Something went wrong while analyzing the resume. Please try again.",
  );
}

/* ---------------- History ---------------- */
export interface HistoryItem {
  report_id: string;
  created_at: string;
  resume_filename: string;
  match_percentage: number;
  match_label: string;
  retention_risk: string;
  seniority_level: string;
  estimated_years: number;
}

export async function fetchHistory(limit = 50): Promise<HistoryItem[]> {
  const res = await fetch(`${API_BASE}/api/history?limit=${limit}`, { headers: authHeaders() });
  const data = await handleJsonResponse<{ scans: HistoryItem[] }>(
    res,
    "Couldn't load scan history.",
  );
  return data.scans;
}

export async function fetchHistoryItem(reportId: string): Promise<ScreeningResult> {
  const res = await fetch(`${API_BASE}/api/history/${encodeURIComponent(reportId)}`, {
    headers: authHeaders(),
  });
  return handleJsonResponse<ScreeningResult>(res, "Couldn't load that report.");
}

export async function deleteHistoryItem(reportId: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/history/${encodeURIComponent(reportId)}`, {
    method: "DELETE",
    headers: authHeaders(),
  });
  await handleJsonResponse(res, "Couldn't delete that report.");
}

export async function clearHistory(): Promise<void> {
  const res = await fetch(`${API_BASE}/api/history`, { method: "DELETE", headers: authHeaders() });
  await handleJsonResponse(res, "Couldn't clear history.");
}

/* ---------------- Skills DB ---------------- */
export interface SkillCategory {
  name: string;
  skills: string[];
}

export interface SkillsDb {
  total_skills: number;
  categories: SkillCategory[];
}

export async function fetchSkillsDb(): Promise<SkillsDb> {
  const res = await fetch(`${API_BASE}/api/skills`, { headers: authHeaders() });
  return handleJsonResponse<SkillsDb>(res, "Couldn't load the skills database.");
}

/* ---------------- Analytics ---------------- */
export interface Analytics {
  total_scans: number;
  avg_match_percentage: number;
  avg_years_experience: number;
  match_label_distribution: Record<string, number>;
  retention_risk_distribution: Record<string, number>;
  seniority_distribution: Record<string, number>;
  top_missing_skills: { skill: string; count: number }[];
  recent_scans_by_day: { date: string; count: number }[];
}

export async function fetchAnalytics(): Promise<Analytics> {
  const res = await fetch(`${API_BASE}/api/analytics`, { headers: authHeaders() });
  return handleJsonResponse<Analytics>(res, "Couldn't load analytics.");
}

/* ---------------- Settings ---------------- */
export interface ScoringWeights {
  dense: number;
  bm25: number;
  tfidf: number;
  keyword: number;
}

export async function fetchSettings(): Promise<ScoringWeights> {
  const res = await fetch(`${API_BASE}/api/settings`, { headers: authHeaders() });
  const data = await handleJsonResponse<{ scoring_weights: ScoringWeights }>(
    res,
    "Couldn't load settings.",
  );
  return data.scoring_weights;
}

export async function saveSettings(weights: ScoringWeights): Promise<ScoringWeights> {
  const res = await fetch(`${API_BASE}/api/settings`, {
    method: "PUT",
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(weights),
  });
  const data = await handleJsonResponse<{ scoring_weights: ScoringWeights }>(
    res,
    "Couldn't save settings.",
  );
  return data.scoring_weights;
}

export async function resetSettings(): Promise<ScoringWeights> {
  const res = await fetch(`${API_BASE}/api/settings/reset`, {
    method: "POST",
    headers: authHeaders(),
  });
  const data = await handleJsonResponse<{ scoring_weights: ScoringWeights }>(
    res,
    "Couldn't reset settings.",
  );
  return data.scoring_weights;
}

/* ---------------- PDF export ---------------- */
async function downloadPdfResponse(res: Response, filename: string) {
  if (!res.ok) {
    let detail = "Couldn't generate the PDF report. Please try again.";
    try {
      const data = await res.json();
      if (typeof data?.detail === "string") detail = data.detail;
    } catch {
      // response wasn't JSON — fall back to the default message
    }
    throw new ApiError(detail);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export async function downloadReportPdf(result: ScreeningResult): Promise<void> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}/api/report/pdf`, {
      method: "POST",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(result),
    });
  } catch {
    throw new ApiError("Couldn't reach the server to generate the PDF.");
  }
  await downloadPdfResponse(res, `${result.report_id || "report"}.pdf`);
}

export async function downloadHistoryPdf(reportId: string): Promise<void> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}/api/history/${encodeURIComponent(reportId)}/pdf`, {
      headers: authHeaders(),
    });
  } catch {
    throw new ApiError("Couldn't reach the server to generate the PDF.");
  }
  await downloadPdfResponse(res, `${reportId}.pdf`);
}
