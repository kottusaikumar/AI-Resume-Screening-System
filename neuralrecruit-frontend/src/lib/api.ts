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
 * Protected requests use the bearer token returned by /api/auth/login.
 * Tokens are kept in sessionStorage and are never embedded in the build.
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

export interface SkillWithContext {
  skill: string;
  section: string;
  start_year?: number | null;
  end_year?: number | null;
  duration_months?: number | null;
}

export interface JobRole {
  title?: string | null;
  company?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  duration_months?: number | null;
  description?: string | null;
  skills: string[];
}

export interface EducationEntry {
  degree?: string | null;
  institution?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  description?: string | null;
}

export interface ResumeSections {
  summary?: string | null;
  experience: JobRole[];
  education: EducationEntry[];
  skills: string[];
  projects?: string | null;
  certifications?: string | null;
  other?: string | null;
}

export interface DetailedResumeAnalysis {
  sections: ResumeSections;
  all_extracted_skills: SkillWithContext[];
  total_experience_years: number;
  seniority_level: string;
}

export interface ScreeningResult {
  // Core scores
  match_percentage: number;
  alignment_index: number;
  dense_score: number;
  bm25_score: number;
  tfidf_score: number;
  keyword_coverage: number;
  positional_skill_score: number;
  experience_skill_score: number;
  combined_resume_quality_score: number;

  // Skills
  matched_skills: string[];
  missing_skills: string[];
  total_keywords: number;
  mandatory_missing: string[];

  // Resume analysis
  section_analysis?: SectionAnalysis | null;
  resume_quality?: ResumeQuality | null;
  experience_info?: ExperienceInfo | null;
  detailed_analysis?: DetailedResumeAnalysis | null;

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
  decision_status: string;
  advisory_only: boolean;
  score_disclaimer: string;
}

export interface SuggestedRole {
  title: string;
  matching_skills: string[];
  evidence_count: number;
}

export interface ResumeReviewResult {
  review_type: "resume_review";
  review_id: string;
  resume_filename: string;
  resume_preview: string;
  resume_health_score: number;
  section_analysis: SectionAnalysis;
  resume_quality: ResumeQuality;
  experience_info: ExperienceInfo;
  detailed_analysis: DetailedResumeAnalysis;
  extracted_skills: string[];
  strengths: string[];
  recommendations: string[];
  suggested_roles: SuggestedRole[];
  review_summary: string;
  processing_time_seconds: number;
  analyzer_name: string;
  advisory_only: boolean;
  job_match_assessed: false;
}

export class ApiError extends Error {}

const API_BASE =
  (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, "") ||
  "http://localhost:8000";

let accessToken = "";

export function setAccessToken(token: string | null) {
  accessToken = token ?? "";
}

function authHeaders(extra?: Record<string, string>): Record<string, string> {
  return accessToken ? { Authorization: `Bearer ${accessToken}`, ...extra } : { ...extra };
}

function withScoreDefaults(result: ScreeningResult): ScreeningResult {
  return {
    ...result,
    alignment_index: result.alignment_index ?? result.match_percentage,
    positional_skill_score: result.positional_skill_score ?? 0,
    experience_skill_score: result.experience_skill_score ?? 0,
    combined_resume_quality_score: result.combined_resume_quality_score ?? 0,
    score_disclaimer:
      result.score_disclaimer ??
      "Evidence alignment is advisory and requires human review.",
  };
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
    if (res.status === 401 && typeof window !== "undefined") {
      window.dispatchEvent(new Event("neuralrecruit:unauthorized"));
    }
    throw new ApiError(detail);
  }
  return res.json();
}

export interface AuthUser {
  id: string;
  email: string;
  role: "admin" | "recruiter" | "reviewer";
  organization_id: string;
}

export async function login(email: string, password: string) {
  const res = await fetch(`${API_BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  return handleJsonResponse<{
    access_token: string;
    token_type: string;
    expires_in: number;
    user: AuthUser;
  }>(res, "Sign in failed.");
}

export async function accessShowcase() {
  const res = await fetch(`${API_BASE}/api/auth/showcase`, { method: "POST" });
  return handleJsonResponse<{
    access_token: string;
    token_type: string;
    expires_in: number;
    user: AuthUser;
  }>(res, "The showcase workspace is temporarily unavailable.");
}

export async function fetchCurrentUser(): Promise<AuthUser> {
  const res = await fetch(`${API_BASE}/api/auth/me`, { headers: authHeaders() });
  return handleJsonResponse<AuthUser>(res, "Your session is no longer valid.");
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
  form.append("blind_mode", "true");
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

  const result = await handleJsonResponse<ScreeningResult>(
    res,
    "Something went wrong while analyzing the resume. Please try again.",
  );
  return withScoreDefaults(result);
}

export async function reviewResume(file: File): Promise<ResumeReviewResult> {
  const form = new FormData();
  form.append("resume", file);
  form.append("blind_mode", "true");

  let res: Response;
  try {
    res = await fetch(`${API_BASE}/api/review-resume`, {
      method: "POST",
      headers: authHeaders(),
      body: form,
    });
  } catch {
    throw new ApiError(
      "Couldn't reach the resume review server. Check that the backend is running.",
    );
  }
  return handleJsonResponse<ResumeReviewResult>(
    res,
    "Something went wrong while reviewing the resume. Please try again.",
  );
}

export interface RankedCandidate {
  rank: number;
  result: ScreeningResult;
}

export interface CandidatePoolResponse {
  job_description_preview: string;
  total_candidates: number;
  failed: string[];
  candidates: RankedCandidate[];
}

export interface RoleComparisonInput {
  title: string;
  description: string;
  mandatory_skills?: string;
}

export interface RankedRole {
  rank: number;
  role_id: string;
  role_title: string;
  result: ScreeningResult;
}

export interface RolePortfolioResponse {
  resume_filename: string;
  total_roles: number;
  failed: string[];
  roles: RankedRole[];
}

export async function analyzeCandidatePool(
  files: File[],
  jobDescription: string,
  mandatorySkills = "",
): Promise<CandidatePoolResponse> {
  const form = new FormData();
  files.forEach((file) => form.append("resumes", file));
  form.append("job_description", jobDescription);
  form.append("mandatory_skills", mandatorySkills);
  form.append("blind_mode", "true");
  form.append("save_to_history", "false");

  let res: Response;
  try {
    res = await fetch(`${API_BASE}/api/analyze/bulk`, {
      method: "POST",
      headers: authHeaders(),
      body: form,
    });
  } catch {
    throw new ApiError("Couldn't reach the comparison server. Check that the backend is running.");
  }
  const data = await handleJsonResponse<CandidatePoolResponse>(
    res,
    "Candidate comparison failed. Please review the files and try again.",
  );
  return {
    ...data,
    candidates: data.candidates.map((candidate) => ({
      ...candidate,
      result: withScoreDefaults(candidate.result),
    })),
  };
}

export async function analyzeRolePortfolio(
  file: File,
  roles: RoleComparisonInput[],
): Promise<RolePortfolioResponse> {
  const form = new FormData();
  form.append("resume", file);
  form.append("roles_json", JSON.stringify(roles));
  form.append("blind_mode", "true");
  form.append("save_to_history", "false");

  let res: Response;
  try {
    res = await fetch(`${API_BASE}/api/analyze/roles`, {
      method: "POST",
      headers: authHeaders(),
      body: form,
    });
  } catch {
    throw new ApiError("Couldn't reach the comparison server. Check that the backend is running.");
  }
  const data = await handleJsonResponse<RolePortfolioResponse>(
    res,
    "Role comparison failed. Please review the job descriptions and try again.",
  );
  return {
    ...data,
    roles: data.roles.map((role) => ({
      ...role,
      result: withScoreDefaults(role.result),
    })),
  };
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
  const result = await handleJsonResponse<ScreeningResult>(res, "Couldn't load that report.");
  return withScoreDefaults(result);
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
  positional_skill: number;
  experience_skill: number;
  resume_quality: number;
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
