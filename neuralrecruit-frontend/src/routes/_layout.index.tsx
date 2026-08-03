import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Briefcase,
  CheckCircle2,
  CircleAlert,
  Cpu,
  Download,
  FileText,
  Gauge,
  Lightbulb,
  Radar,
  ShieldCheck,
  Sparkles,
  Target,
  UploadCloud,
  Wand2,
  X,
  type LucideIcon,
} from "lucide-react";
import {
  analyzeResume,
  ApiError,
  downloadReportPdf,
  formatExperienceRequirement,
  reviewResume,
  type ResumeReviewResult,
  type ScreeningResult,
} from "@/lib/api";
import { useScanner, useExport } from "@/lib/scanner-context";
import { useAuth } from "@/lib/auth-context";
import { extractScannedPdfText } from "@/lib/browser-ocr";
import { downloadCsv } from "@/lib/csv";
import { ResumeAnnotationViewer } from "@/components/resume-annotation-viewer";

export const Route = createFileRoute("/_layout/")({
  head: () => ({
    meta: [
      { title: "NeuralRecruit - Explainable Resume Intelligence" },
      {
        name: "description",
        content:
          "Source-available resume review and job-matching decision support for HR teams and technical recruiters, with explainable evidence and mandatory human review.",
      },
      { property: "og:title", content: "NeuralRecruit - Explainable Resume Intelligence" },
      {
        property: "og:description",
        content:
          "Review resumes, inspect candidate evidence, and compare job alignment without a paid or external LLM API.",
      },
    ],
  }),
  component: ScannerPage,
});

const STEPS = [
  {
    key: "parse",
    label: "Reading candidate profile",
    description: "Extracting skills, experience, and education",
    icon: FileText,
  },
  {
    key: "history",
    label: "Structuring work history",
    description: "Organizing roles, tenure, and supporting evidence",
    icon: Briefcase,
  },
  {
    key: "skills",
    label: "Comparing role signals",
    description: "Checking required skills and contextual fit",
    icon: Target,
  },
  {
    key: "report",
    label: "Preparing decision brief",
    description: "Building an explainable recruiter review",
    icon: Sparkles,
  },
];

const STEP_FEATURES = [
  ["Profile header", "Resume sections", "Document quality"],
  ["Roles and tenure", "Career progression", "Impact evidence"],
  ["Required skills", "Context evidence", "Role relevance"],
  ["Scoring signals", "Evidence summary", "Human review packet"],
];

const REVIEW_STEPS = [
  STEPS[0],
  STEPS[1],
  {
    key: "quality",
    label: "Assessing resume quality",
    description: "Reviewing ATS readability and evidence strength",
    icon: Gauge,
  },
  {
    key: "review",
    label: "Preparing resume review",
    description: "Organizing skills, strengths, and suitable role families",
    icon: Sparkles,
  },
];

const REVIEW_STEP_FEATURES = [
  STEP_FEATURES[0],
  STEP_FEATURES[1],
  ["ATS readability", "Section coverage", "Achievement evidence"],
  ["Detected skills", "Profile strengths", "Role suggestions"],
];

const TEMPLATES = ["Software Engineer", "Product Manager", "Data Scientist", "Designer"];
type ScanMode = "resume-review" | "job-match";

function ScannerPage() {
  const { ensureAccess } = useAuth();
  const {
    phase,
    setPhase,
    file,
    setFile,
    jd,
    setJd,
    setProgress,
    activeStep,
    setActiveStep,
    result,
    setResult,
    reviewResult,
    setReviewResult,
    error,
    setError,
  } = useScanner();
  const { setExportConfig } = useExport();
  const [mode, setMode] = useState<ScanMode>("resume-review");
  const [analysisStatus, setAnalysisStatus] = useState<string | null>(null);

  useEffect(() => {
    if (phase === "results" && !result && !reviewResult) {
      setPhase("upload");
    }
  }, [phase, result, reviewResult, setPhase]);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "auto" });
  }, [phase]);

  useEffect(() => {
    if (phase !== "analyzing" || !file) return;

    let cancelled = false;
    setProgress(0);
    setActiveStep(0);
    setAnalysisStatus("Preparing your resume for analysis…");

    // The API doesn't stream measurable progress, so show honest, time-based
    // processing phases instead of presenting a fabricated percentage.
    const stageTimers = [3000, 8000, 15000].map((delay, index) =>
      window.setTimeout(() => {
        if (!cancelled) setActiveStep(index + 1);
      }, delay),
    );

    const request = async () => {
      const browserExtractedText = await extractScannedPdfText(file, ({ message, progress }) => {
        if (cancelled) return;
        setAnalysisStatus(message);
        if (typeof progress === "number") {
          setProgress(Math.round(progress * 35));
        }
      });
      if (cancelled) throw new Error("Analysis cancelled.");

      setAnalysisStatus(
        mode === "resume-review"
          ? "Analysing resume structure, skills, and career evidence…"
          : "Comparing resume evidence with the role requirements…",
      );
      const hasAccess = await ensureAccess();
      if (!hasAccess) {
        throw new ApiError(
          "The analysis server is temporarily unavailable. Please wait a moment and try again.",
        );
      }
      return mode === "resume-review"
        ? reviewResume(file, browserExtractedText)
        : analyzeResume(file, jd, "", browserExtractedText);
    };

    request()
      .then((data) => {
        if (cancelled) return;
        stageTimers.forEach(window.clearTimeout);
        setProgress(100);
        setActiveStep(STEPS.length - 1);
        setTimeout(() => {
          if (cancelled) return;
          if (mode === "resume-review") {
            setReviewResult(data as ResumeReviewResult);
            setResult(null);
          } else {
            setResult(data as ScreeningResult);
            setReviewResult(null);
          }
          setPhase("results");
        }, 350);
      })
      .catch((err) => {
        if (cancelled) return;
        stageTimers.forEach(window.clearTimeout);
        const message =
          err instanceof ApiError
            ? err.message
            : err instanceof Error
              ? err.message
              : "Something went wrong while analyzing the resume. Please try again.";
        setError(message);
        setAnalysisStatus(null);
        setPhase("upload");
      });

    return () => {
      cancelled = true;
      stageTimers.forEach(window.clearTimeout);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, file, mode]);

  // Register the Results page's CSV export with the TopBar's Export button.
  useEffect(() => {
    if (phase === "results" && reviewResult) {
      setExportConfig(() => {
        downloadCsv(`${reviewResult.review_id}.csv`, [
          ["Field", "Value"],
          ["Review ID", reviewResult.review_id],
          ["Resume File", reviewResult.resume_filename],
          ["Resume Health", reviewResult.resume_health_score],
          ["ATS Readability", reviewResult.resume_quality.ats_format_score],
          ["Section Completeness", reviewResult.section_analysis.completeness_score],
          ["Estimated Experience", reviewResult.experience_info.estimated_years],
          ["Seniority", reviewResult.experience_info.seniority_level],
          ["Job Match Assessed", "No"],
          [],
          ["Detected Skills", reviewResult.extracted_skills.join("; ")],
          ["Suggested Roles", reviewResult.suggested_roles.map((role) => role.title).join("; ")],
          [],
          ["Recommendations", ""],
          ...reviewResult.recommendations.map((recommendation, index) => [
            `#${index + 1}`,
            recommendation,
          ]),
        ]);
      }, "resume review");
    } else if (phase === "results" && result) {
      setExportConfig(() => {
        downloadCsv(`${result.report_id || "report"}.csv`, [
          ["Field", "Value"],
          ["Report ID", result.report_id],
          ["Resume File", result.resume_filename],
          ["Evidence Alignment Index", result.alignment_index ?? result.match_percentage],
          ["Fit Band", result.match_label],
          ["Decision Status", result.decision_status ?? "Human review required"],
          ["Technical Fit (Dense)", result.dense_score],
          ["Keyword Match (BM25)", result.bm25_score],
          ["TF-IDF Diagnostic (not weighted)", result.tfidf_score],
          ["Keyword Coverage", result.keyword_coverage],
          ["Positional Skill Score", result.positional_skill_score],
          ["Experience-Skill Score", result.experience_skill_score],
          ["Resume Quality (separate from fit)", result.combined_resume_quality_score],
          ["Years Experience", result.experience_info?.estimated_years ?? ""],
          ["Seniority Level", result.experience_info?.seniority_level ?? ""],
          ["Salary Fit", result.salary_fit],
          ["Signal Agreement", result.confidence],
          [],
          ["Matched Skills", result.matched_skills.join("; ")],
          ["Skills Not Evidenced", result.missing_skills.join("; ")],
          ["Mandatory Missing", result.mandatory_missing.join("; ")],
          [],
          ["Recommendations", ""],
          ...result.recommendations.map((r, i) => [`#${i + 1}`, r]),
        ]);
      }, "report");
    } else {
      setExportConfig(null);
    }
    return () => setExportConfig(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, result, reviewResult]);

  const fileName = file?.name ?? null;
  const canRun = useMemo(
    () => Boolean(file && (mode === "resume-review" || jd.trim().length > 20)),
    [file, jd, mode],
  );

  return (
    <>
      {phase === "upload" && (
        <UploadView
          fileName={fileName}
          file={file}
          setFile={setFile}
          jd={jd}
          setJd={setJd}
          mode={mode}
          setMode={(nextMode) => {
            setMode(nextMode);
            setError(null);
          }}
          canRun={!!canRun}
          error={error}
          onDismissError={() => setError(null)}
          onRun={() => {
            setError(null);
            setPhase("analyzing");
          }}
        />
      )}
      {phase === "analyzing" && (
        <AnalyzingView
          activeStep={activeStep}
          fileName={fileName}
          mode={mode}
          analysisStatus={analysisStatus}
        />
      )}
      {phase === "results" && reviewResult && (
        <ResumeReviewView
          result={reviewResult}
          fileName={fileName}
          file={file}
          onNewScan={() => {
            setReviewResult(null);
            setPhase("upload");
          }}
        />
      )}
      {phase === "results" && result && <ResultsView result={result} fileName={fileName} />}
    </>
  );
}

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_EXTENSIONS = [".pdf", ".docx", ".txt"];

function validateFile(f: File): string | null {
  const ext = f.name.slice(f.name.lastIndexOf(".")).toLowerCase();
  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    return "We couldn't read that file. Please upload a PDF, DOCX, or TXT resume.";
  }
  if (f.size > MAX_FILE_SIZE) {
    return "This file is over 10MB. Try compressing it or uploading a smaller version.";
  }
  return null;
}

/* ---------------- Upload ---------------- */
function UploadView({
  fileName,
  file,
  setFile,
  jd,
  setJd,
  mode,
  setMode,
  canRun,
  error,
  onDismissError,
  onRun,
}: {
  fileName: string | null;
  file: File | null;
  setFile: (f: File | null) => void;
  jd: string;
  setJd: (s: string) => void;
  mode: ScanMode;
  setMode: (mode: ScanMode) => void;
  canRun: boolean;
  error: string | null;
  onDismissError: () => void;
  onRun: () => void;
}) {
  const [drag, setDrag] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);

  const handleFile = (f: File | undefined | null) => {
    if (!f) return;
    const validationError = validateFile(f);
    if (validationError) {
      setFileError(validationError);
      setFile(null);
      return;
    }
    setFileError(null);
    setFile(f);
  };

  const displayError = fileError || error;

  return (
    <div className="scanner-workspace space-y-8 lg:space-y-6">
      <div
        className="scanner-mode-switch glass grid gap-2 rounded-xl p-2 sm:grid-cols-2 lg:gap-1.5 lg:p-1.5"
        role="group"
        aria-label="Analysis mode"
      >
        {[
          {
            value: "resume-review" as const,
            icon: FileText,
            title: "Resume Review",
            description: "Resume only · quality, skills, experience, and role suggestions",
          },
          {
            value: "job-match" as const,
            icon: Target,
            title: "Job Match",
            description: "Resume + job description · evidence-based match analysis",
          },
        ].map((option) => (
          <button
            key={option.value}
            type="button"
            aria-pressed={mode === option.value}
            onClick={() => setMode(option.value)}
            className={`flex min-w-0 items-start gap-3 rounded-lg border p-4 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 lg:p-3 ${
              mode === option.value
                ? "border-primary/45 bg-primary/10 shadow-sm"
                : "border-transparent hover:border-border hover:bg-surface-2/40"
            }`}
          >
            <span
              className={`grid size-10 shrink-0 place-items-center rounded-lg border lg:size-9 ${
                mode === option.value
                  ? "border-primary/30 bg-primary/15 text-primary-glow"
                  : "border-border bg-surface-2/50 text-muted-foreground"
              }`}
            >
              <option.icon className="size-4" />
            </span>
            <span className="min-w-0">
              <span className="block font-display font-semibold">{option.title}</span>
              <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">
                {option.description}
              </span>
            </span>
          </button>
        ))}
      </div>

      <header className="scanner-intro flex flex-col gap-2">
        <div className="font-mono-label text-primary-glow">
          // {mode === "resume-review" ? "initiate_resume_review" : "initiate_talent_scan"}
        </div>
        <h1 className="text-4xl md:text-4xl font-bold tracking-tight">
          {mode === "resume-review" ? (
            <>
              Understand the <span className="text-gradient-primary">Resume</span>
            </>
          ) : (
            <>
              Initiate <span className="text-gradient-primary">Neural</span> Talent Scan
            </>
          )}
        </h1>
        <p className="text-muted-foreground max-w-2xl md:text-sm">
          {mode === "resume-review"
            ? "Upload one resume to inspect its structure, ATS readability, experience evidence, skills, and suitable role families. No job description or job-match score is used."
            : "Upload a candidate dossier and paste the role brief. The engine extracts skills, validates work history, and benchmarks evidence against the JD."}
        </p>
      </header>

      {displayError && (
        <div
          className="glass rounded-xl border border-destructive/40 bg-destructive/10 p-4 flex items-start gap-3"
          role="alert"
          aria-live="assertive"
        >
          <div className="size-9 rounded-md bg-destructive/15 border border-destructive/30 grid place-items-center shrink-0">
            <AlertTriangle className="size-4 text-destructive" />
          </div>
          <div className="flex-1">
            <div className="font-display font-semibold text-sm text-destructive">
              Something needs attention
            </div>
            <div className="text-sm text-muted-foreground mt-0.5">{displayError}</div>
          </div>
          <button
            type="button"
            onClick={() => {
              setFileError(null);
              onDismissError();
            }}
            className="grid size-9 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive/60"
            aria-label="Dismiss"
          >
            <X className="size-4" />
          </button>
        </div>
      )}

      <div className="scanner-input-grid grid gap-6 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] lg:gap-5">
        {/* Upload */}
        <section className="scanner-panel glass min-w-0 rounded-xl p-6 relative overflow-hidden">
          <div className="absolute inset-0 grid-bg opacity-40 pointer-events-none" />
          <div className="relative flex items-center justify-between mb-5">
            <div className="flex items-center gap-2.5">
              <div className="size-9 rounded-md bg-primary/15 border border-primary/30 grid place-items-center">
                <UploadCloud className="size-4 text-primary-glow" />
              </div>
              <h2 className="font-display font-semibold text-lg">Resume Upload</h2>
            </div>
            <span className="font-mono-label text-muted-foreground">PDF · DOCX · TXT · 10MB</span>
          </div>

          <label
            onDragOver={(e) => {
              e.preventDefault();
              setDrag(true);
            }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDrag(false);
              handleFile(e.dataTransfer.files?.[0]);
            }}
            className={`relative block cursor-pointer rounded-lg border-2 border-dashed transition has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-primary/60 has-[:focus-visible]:ring-offset-2 has-[:focus-visible]:ring-offset-background ${
              drag
                ? "border-primary bg-primary/10"
                : "border-border hover:border-primary/50 hover:bg-surface-2/40"
            }`}
          >
            <input
              type="file"
              accept=".pdf,.docx,.txt"
              className="sr-only"
              aria-label="Upload candidate resume"
              onChange={(e) => handleFile(e.target.files?.[0])}
            />
            <div className="scanner-dropzone px-6 py-12 flex flex-col items-center text-center gap-4">
              {!fileName ? (
                <>
                  <div className="scanner-upload-icon size-16 rounded-2xl bg-gradient-to-br from-primary/30 to-primary-glow/20 border border-primary/30 grid place-items-center animate-pulse-glow">
                    <UploadCloud className="size-7 text-primary-glow" />
                  </div>
                  <div>
                    <div className="font-display font-semibold text-lg">
                      Drop the candidate resume
                    </div>
                    <div className="text-sm text-muted-foreground mt-1">
                      or click to browse · processed temporarily
                    </div>
                  </div>
                  <div className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-semibold glow-primary">
                    <UploadCloud className="size-4" /> Select File
                  </div>
                </>
              ) : (
                <>
                  <div className="scanner-upload-icon size-16 rounded-2xl bg-success/15 border border-success/40 grid place-items-center glow-success">
                    <CheckCircle2 className="size-7 text-success" />
                  </div>
                  <div>
                    <div className="font-display font-semibold text-lg">Dossier loaded</div>
                    <div className="font-mono text-xs text-muted-foreground mt-1.5 break-all">
                      {fileName}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      setFile(null);
                    }}
                    className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
                  >
                    <X className="size-3.5" /> Replace
                  </button>
                </>
              )}
            </div>
          </label>

          <div className="relative mt-6 grid grid-cols-3 gap-3">
            {[
              { label: "Max size", value: "10 MB" },
              { label: "Formats", value: "PDF · DOCX · TXT" },
              { label: "Encoding", value: "Text-based" },
            ].map((tip) => (
              <div key={tip.label} className="rounded-md border border-border bg-surface-2/30 p-3">
                <div className="font-mono-label text-muted-foreground">{tip.label}</div>
                <div className="text-xs mt-1 truncate font-mono text-foreground/80">
                  {tip.value}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* JD or resume-only intelligence preview */}
        {mode === "job-match" ? (
          <section className="scanner-panel glass min-w-0 rounded-xl p-6">
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2.5">
                <div className="size-9 rounded-md bg-success/15 border border-success/30 grid place-items-center">
                  <Briefcase className="size-4 text-success" />
                </div>
                <h2 id="job-description-label" className="font-display font-semibold text-lg">
                  Job Description
                </h2>
              </div>
              <span className="font-mono-label text-muted-foreground">AUTO-DETECT: ON</span>
            </div>

            <textarea
              aria-labelledby="job-description-label"
              value={jd}
              onChange={(e) => setJd(e.target.value)}
              placeholder="Paste the target role brief — key responsibilities, technical competencies, leadership requirements, and cultural expectations for the highest match precision…"
              className="w-full h-[260px] rounded-lg bg-surface-2/40 border border-border focus:border-primary/60 focus:outline-none focus:ring-2 focus:ring-primary/30 p-4 text-sm font-mono leading-relaxed placeholder:text-muted-foreground/70 resize-none transition"
            />

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <span className="font-mono-label text-muted-foreground mr-1">QUICK_TEMPLATES:</span>
              {TEMPLATES.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setJd(seedJD(t))}
                  className="rounded-full border border-border bg-surface-2/40 px-3 py-1.5 text-xs transition hover:border-primary/50 hover:text-primary-glow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
                >
                  {t}
                </button>
              ))}
            </div>

            <div className="mt-5 grid grid-cols-3 gap-3 pt-5 border-t border-border">
              <Stat label="TOKENS" value={`${Math.max(0, Math.round(jd.length / 4))}`} />
              <Stat label="MODEL" value="Neural_L7" accent />
              <Stat label="BIAS_FILTER" value="ON" accent />
            </div>
          </section>
        ) : (
          <section className="scanner-panel glass min-w-0 rounded-xl p-6">
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2.5">
                <div className="size-9 rounded-md bg-success/15 border border-success/30 grid place-items-center">
                  <Radar className="size-4 text-success" />
                </div>
                <h2 className="font-display font-semibold text-lg">Resume Intelligence</h2>
              </div>
              <span className="font-mono-label text-success">NO JD REQUIRED</span>
            </div>
            <div className="rounded-xl border border-border bg-surface-2/30 p-5 lg:p-4">
              <div className="font-mono-label text-muted-foreground">REVIEW_OUTPUT</div>
              <div className="mt-4 grid gap-3">
                {[
                  [
                    "ATS & document quality",
                    "Readability, length, action verbs, and quantified evidence",
                  ],
                  [
                    "Profile structure",
                    "Summary, experience, education, skills, projects, certifications",
                  ],
                  [
                    "Career evidence",
                    "Estimated experience, seniority, and structured work history",
                  ],
                  [
                    "Skill intelligence",
                    "Detected capabilities and evidence-backed role suggestions",
                  ],
                ].map(([title, description]) => (
                  <div
                    key={title}
                    className="flex gap-3 rounded-lg border border-border bg-surface/60 p-3.5"
                  >
                    <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" />
                    <div>
                      <div className="text-sm font-semibold">{title}</div>
                      <div className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                        {description}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="mt-5 flex items-start gap-2.5 rounded-lg border border-primary/20 bg-primary/5 p-4 text-xs leading-relaxed text-muted-foreground">
              <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary-glow" />
              Resume health describes document quality only. It does not predict hiring success or
              measure fit for a specific job.
            </div>
          </section>
        )}
      </div>

      {/* Run bar */}
      <div className="glass rounded-xl p-5 lg:p-4 flex flex-col md:flex-row items-center gap-4">
        <div className="flex items-center gap-3 flex-1">
          <div
            className={`size-10 rounded-md grid place-items-center border ${canRun ? "bg-success/15 border-success/40 text-success" : "bg-surface-2/40 border-border text-muted-foreground"}`}
          >
            <Cpu className="size-5" />
          </div>
          <div id="analysis-readiness" role="status" aria-live="polite">
            <div className="font-display font-semibold">
              {canRun ? "Ready to scan" : "Awaiting inputs"}
            </div>
            <div className="text-xs text-muted-foreground font-mono">
              {fileName ? "✓ resume" : "· resume"} &nbsp;{" "}
              {mode === "resume-review"
                ? "· no job description needed"
                : jd.trim().length > 20
                  ? "✓ job_description"
                  : "· job_description"}
            </div>
          </div>
        </div>
        <button
          type="button"
          disabled={!canRun}
          onClick={onRun}
          aria-describedby="analysis-readiness"
          className={`inline-flex items-center gap-2 px-6 h-12 lg:px-5 lg:h-11 rounded-md font-semibold transition ${
            canRun
              ? "bg-gradient-to-r from-primary to-primary-glow text-primary-foreground glow-primary hover:scale-[1.02] motion-reduce:hover:scale-100"
              : "bg-surface-2/40 text-muted-foreground border border-border cursor-not-allowed"
          }`}
        >
          <Sparkles className="size-4" />
          {mode === "resume-review" ? "Analyse Resume" : "Run Job Match"}
          <ArrowRight className="size-4" />
        </button>
      </div>

      <FeatureRow />
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div>
      <div className="font-mono-label text-muted-foreground">{label}</div>
      <div className={`mt-1 font-mono text-sm ${accent ? "text-success" : "text-foreground"}`}>
        {value}
      </div>
    </div>
  );
}

function FeatureRow() {
  const items = [
    {
      icon: ShieldCheck,
      title: "Temporary Processing",
      desc: "Uploaded files are deleted after text extraction.",
    },
    {
      icon: Target,
      title: "Contextual Matching",
      desc: "Goes beyond keywords to understand project impact.",
    },
    {
      icon: Activity,
      title: "Human Decision Support",
      desc: "Evidence summaries require recruiter review.",
    },
  ];
  return (
    <div className="grid md:grid-cols-3 gap-4">
      {items.map((i) => (
        <div key={i.title} className="glass rounded-lg p-5 flex gap-3">
          <div className="size-9 rounded-md bg-primary/15 border border-primary/30 grid place-items-center shrink-0">
            <i.icon className="size-4 text-primary-glow" />
          </div>
          <div>
            <div className="font-semibold text-sm">{i.title}</div>
            <div className="text-xs text-muted-foreground mt-1 leading-relaxed">{i.desc}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ---------------- Analyzing ---------------- */
function AnalyzingView({
  activeStep,
  fileName,
  mode,
  analysisStatus,
}: {
  activeStep: number;
  fileName: string | null;
  mode: ScanMode;
  analysisStatus: string | null;
}) {
  const steps = mode === "resume-review" ? REVIEW_STEPS : STEPS;
  const stepFeatures = mode === "resume-review" ? REVIEW_STEP_FEATURES : STEP_FEATURES;
  const currentStep = steps[activeStep] ?? steps[0];
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  useEffect(() => {
    const startedAt = Date.now();
    const timer = window.setInterval(
      () => setElapsedSeconds(Math.floor((Date.now() - startedAt) / 1000)),
      1000,
    );
    return () => window.clearInterval(timer);
  }, []);

  const elapsedLabel = `${String(Math.floor(elapsedSeconds / 60)).padStart(2, "0")}:${String(
    elapsedSeconds % 60,
  ).padStart(2, "0")}`;
  const documentSections = [
    { label: "Profile overview", helper: "Identity and professional summary", icon: FileText },
    { label: "Work history", helper: "Roles, tenure, and achievements", icon: Briefcase },
    { label: "Skills and education", helper: "Capabilities and qualifications", icon: Radar },
    { label: "Evidence notes", helper: "Context for recruiter review", icon: Gauge },
  ];

  return (
    <div className="screening-page space-y-5" role="status" aria-live="polite">
      <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div className="max-w-3xl">
          <div className="font-mono-label text-primary-glow">// secure_candidate_screening</div>
          <h1 className="mt-2 text-4xl font-bold tracking-tight md:text-5xl">
            {mode === "resume-review" ? "Analysing your resume..." : "Analysing candidate fit..."}
          </h1>
          <p className="mt-2 max-w-2xl text-muted-foreground">
            {analysisStatus ??
              (mode === "resume-review"
                ? "Reading the resume and organizing its skills, career evidence, and document-quality signals."
                : "Reading the resume, organizing evidence, and comparing it with the role benchmark.")}
          </p>
        </div>
        <div className="screening-time-card flex items-center gap-3 rounded-xl border border-border bg-surface/60 px-4 py-3">
          <span className="screening-status-dot size-2 rounded-full bg-success" />
          <div>
            <div className="font-mono-label text-muted-foreground">Session time</div>
            <div className="mt-0.5 font-mono text-sm font-semibold">{elapsedLabel}</div>
          </div>
        </div>
      </header>

      <section className="screening-shell glass overflow-hidden rounded-2xl">
        <div className="screening-topbar flex flex-col justify-between gap-3 border-b border-border px-5 py-4 sm:flex-row sm:items-center sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <div className="grid size-9 shrink-0 place-items-center rounded-lg border border-primary/25 bg-primary/10 text-primary-glow">
              <FileText className="size-4" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold">
                {fileName ?? "Candidate document"}
              </div>
              <div className="mt-0.5 text-xs text-muted-foreground">
                Candidate screening workspace
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs text-success">
            <ShieldCheck className="size-3.5" aria-hidden="true" />
            Local and temporary processing
          </div>
        </div>

        <div className="grid lg:grid-cols-[1.12fr_0.88fr]">
          <div className="screening-preview relative border-b border-border p-4 sm:p-6 lg:border-b-0 lg:border-r">
            <div className="mb-4 flex items-center justify-between">
              <span className="font-mono-label text-muted-foreground">Candidate document</span>
              <span className="screening-live-label inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-primary-glow">
                <span className="screening-status-dot size-1.5 rounded-full bg-primary-glow" />
                Live reading
              </span>
            </div>

            <div className="screening-document relative mx-auto max-w-[620px] overflow-hidden rounded-xl border border-border bg-surface/70 p-4 shadow-2xl sm:p-5">
              <div className="screening-frame-corners pointer-events-none" aria-hidden="true">
                <span className="screening-corner screening-corner-tl" />
                <span className="screening-corner screening-corner-tr" />
                <span className="screening-corner screening-corner-bl" />
                <span className="screening-corner screening-corner-br" />
              </div>
              <span className="screening-master-scan pointer-events-none" aria-hidden="true" />

              <div className="screening-document-header flex items-center gap-3 border-b border-border pb-4">
                <div className="screening-avatar grid size-11 shrink-0 place-items-center rounded-full border border-primary/20 bg-primary/10">
                  <FileText className="size-4 text-primary-glow" aria-hidden="true" />
                </div>
                <div className="flex-1 space-y-2">
                  <div className="screening-line h-2.5 w-2/5 rounded-full" />
                  <div className="screening-line h-2 w-3/5 rounded-full opacity-60" />
                </div>
                <span className="rounded-md border border-border bg-surface-2/70 px-2 py-1 font-mono text-[9px] text-muted-foreground">
                  PROFILE
                </span>
              </div>

              <div className="mt-4 space-y-2.5">
                {documentSections.map((section, index) => {
                  const active = index === activeStep;
                  const reviewed = index < activeStep;
                  return (
                    <article
                      key={section.label}
                      className={`screening-document-section relative overflow-hidden rounded-lg border p-3 transition-colors ${
                        active
                          ? "is-reading border-primary/40 bg-primary/10"
                          : reviewed
                            ? "is-reviewed border-success/20 bg-success/5"
                            : "border-border bg-surface-2/30"
                      }`}
                    >
                      {active && <span className="screening-section-sweep" aria-hidden="true" />}
                      <div className="relative z-10 flex items-center gap-3">
                        <div
                          className={`grid size-8 shrink-0 place-items-center rounded-lg ${
                            reviewed
                              ? "bg-success/10 text-success"
                              : active
                                ? "bg-primary/15 text-primary-glow"
                                : "bg-surface-3/70 text-muted-foreground"
                          }`}
                        >
                          {reviewed ? (
                            <CheckCircle2 className="size-4" aria-hidden="true" />
                          ) : (
                            <section.icon className="size-4" aria-hidden="true" />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-xs font-semibold">{section.label}</span>
                            <span
                              className={`font-mono text-[9px] uppercase tracking-wider ${
                                active
                                  ? "text-primary-glow"
                                  : reviewed
                                    ? "text-success"
                                    : "text-muted-foreground"
                              }`}
                            >
                              {active ? "Reading" : reviewed ? "Reviewed" : "Queued"}
                            </span>
                          </div>
                          <p className="mt-1 text-[11px] text-muted-foreground">{section.helper}</p>
                        </div>
                      </div>
                      <div className="relative z-10 mt-3 flex gap-1.5">
                        <span className="screening-line h-1.5 w-full rounded-full" />
                        <span className="screening-line h-1.5 w-2/3 rounded-full opacity-60" />
                        <span className="screening-line h-1.5 w-1/3 rounded-full opacity-40" />
                      </div>
                    </article>
                  );
                })}
              </div>
            </div>
          </div>

          <aside className="screening-activity p-5 sm:p-6">
            <div className="flex items-center justify-between">
              <span className="font-mono-label text-muted-foreground">Screening activity</span>
              <span className="rounded-full border border-border bg-surface-2/60 px-2.5 py-1 font-mono text-[9px] text-muted-foreground">
                PHASE {activeStep + 1}/{steps.length}
              </span>
            </div>

            <div className="screening-current mt-5 rounded-xl border border-primary/30 bg-primary/10 p-4">
              <div className="flex items-start gap-3">
                <div className="screening-current-icon grid size-10 shrink-0 place-items-center rounded-xl border border-primary/30 bg-primary/15 text-primary-glow">
                  <currentStep.icon className="size-5" aria-hidden="true" />
                </div>
                <div>
                  <div className="text-sm font-semibold">{currentStep.label}</div>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                    {currentStep.description}
                  </p>
                </div>
              </div>
              <div className="mt-4 grid gap-2">
                {stepFeatures[activeStep].map((feature) => (
                  <div
                    key={feature}
                    className="flex items-center gap-2 rounded-lg border border-primary/15 bg-surface/40 px-3 py-2 text-xs"
                  >
                    <span className="screening-feature-pulse size-1.5 rounded-full bg-primary-glow" />
                    {feature}
                    <span className="ml-auto font-mono text-[9px] uppercase tracking-wider text-primary-glow">
                      Inspecting
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <ol className="mt-5 space-y-1">
              {steps.map((step, index) => {
                const active = index === activeStep;
                const reviewed = index < activeStep;
                return (
                  <li
                    key={step.key}
                    className={`flex items-center gap-3 rounded-lg px-2 py-2.5 ${
                      active ? "text-foreground" : "text-muted-foreground"
                    }`}
                    aria-current={active ? "step" : undefined}
                  >
                    <div
                      className={`grid size-7 shrink-0 place-items-center rounded-full border ${
                        reviewed
                          ? "border-success/30 bg-success/10 text-success"
                          : active
                            ? "border-primary/40 bg-primary/15 text-primary-glow"
                            : "border-border bg-surface-2/50"
                      }`}
                    >
                      {reviewed ? (
                        <CheckCircle2 className="size-3.5" aria-hidden="true" />
                      ) : (
                        <span className="font-mono text-[9px]">{index + 1}</span>
                      )}
                    </div>
                    <span className="text-xs font-medium">{step.label}</span>
                    {active && (
                      <span className="ml-auto text-[10px] font-medium text-primary-glow">
                        In progress
                      </span>
                    )}
                  </li>
                );
              })}
            </ol>

            <div
              className="screening-progress mt-5 h-1.5 overflow-hidden rounded-full bg-surface-3"
              role="progressbar"
              aria-label={`${currentStep.label}. Progress cannot yet be measured.`}
            >
              <div className="screening-progress-bar h-full rounded-full bg-gradient-to-r from-primary via-primary-glow to-success" />
            </div>

            <div className="mt-4 flex items-start gap-2.5 rounded-lg border border-border bg-surface-2/35 p-3 text-xs leading-relaxed text-muted-foreground">
              <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-success" aria-hidden="true" />
              <span>
                {elapsedSeconds >= 15
                  ? "Scanned or complex documents can take a little longer. Review is still active."
                  : mode === "resume-review"
                    ? "Resume quality signals are being verified. No job-match score will be produced."
                    : "Scores remain provisional until every signal is reviewed."}
              </span>
            </div>
          </aside>
        </div>
      </section>

      <div className="text-center text-xs text-muted-foreground">
        Keep this page open. The final report will appear automatically.
      </div>
    </div>
  );
}

/* ---------------- Results ---------------- */
function matchTone(label: string): "success" | "warning" | "destructive" {
  if (label === "High Evidence Alignment") return "success";
  if (label === "Moderate Evidence Alignment" || label === "Low Evidence Alignment")
    return "warning";
  return "destructive";
}

function riskTone(risk: string): "success" | "warning" | "destructive" {
  if (risk === "Low") return "success";
  if (risk === "Medium") return "warning";
  return "destructive";
}

export function ResultsView({
  result,
  fileName,
}: {
  result: ScreeningResult;
  fileName: string | null;
}) {
  const { resetScan } = useScanner();
  const navigate = useNavigate();
  const score = Math.round(result.alignment_index ?? result.match_percentage);
  const labelTone = matchTone(result.match_label);
  const exp = result.experience_info;
  const quality = result.resume_quality;
  const section = result.section_analysis;
  const skillEvidence = result.detailed_analysis?.all_extracted_skills ?? [];
  const evidenceFor = (skill: string) =>
    skillEvidence.find((item) => item.skill.toLowerCase() === skill.toLowerCase());

  const [pdfState, setPdfState] = useState<"idle" | "loading" | "error">("idle");

  const handlePdfDownload = async () => {
    setPdfState("loading");
    try {
      await downloadReportPdf(result);
      setPdfState("idle");
    } catch {
      setPdfState("error");
      setTimeout(() => setPdfState("idle"), 3000);
    }
  };

  const experienceRequirement = formatExperienceRequirement(result);
  const yearsExp = exp
    ? `${exp.estimated_years.toFixed(1)} / ${experienceRequirement ?? "—"}`
    : "—";

  const recIcons = [Target, Gauge, Lightbulb];

  return (
    <div className="space-y-6">
      <header className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
        <div>
          <div className="font-mono-label text-success">// analysis_complete</div>
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight mt-1">
            Candidate <span className="text-gradient-primary">Match Report</span>
          </h1>
          <p className="text-muted-foreground mt-2 font-mono text-xs">
            REPORT_ID: {result.report_id || "—"} · FILE:{" "}
            {result.resume_filename ?? fileName ?? "candidate.pdf"} · MODEL: {result.model_name} ·{" "}
            {result.processing_time_seconds.toFixed(2)}s
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {pdfState === "error" && (
            <span className="text-xs text-destructive font-medium mr-1">Couldn't generate PDF</span>
          )}
          <button
            onClick={handlePdfDownload}
            disabled={pdfState === "loading"}
            className="inline-flex items-center gap-2 px-4 h-10 rounded-md border border-border bg-surface-2/40 hover:bg-surface-2 text-sm transition disabled:opacity-60"
          >
            <Download className="size-4" /> {pdfState === "loading" ? "Generating…" : "PDF Report"}
          </button>
          <button
            onClick={() => {
              resetScan();
              navigate({ to: "/" });
            }}
            className="inline-flex items-center gap-2 px-4 h-10 rounded-md border border-success/40 text-success bg-success/10 hover:bg-success/15 text-sm font-semibold transition"
          >
            <Sparkles className="size-4" /> New Scan
          </button>
        </div>
      </header>

      {/* Top row: score + summary */}
      <div className="grid lg:grid-cols-[1fr_1.4fr] gap-6">
        <section className="glass rounded-xl p-8 flex flex-col items-center text-center relative overflow-hidden">
          <div className="absolute inset-0 grid-bg opacity-30 pointer-events-none" />
          <div className="font-mono-label text-muted-foreground relative">
            EVIDENCE_ALIGNMENT_INDEX
          </div>
          <div className="text-sm text-muted-foreground mt-1.5">
            {result.dense_method === "neural (MiniLM-L6-v2)"
              ? "Neural embeddings (MiniLM-L6-v2)"
              : "Classical LSA (TF-IDF + SVD)"}
            <br />
            Multi-signal retrieval indicator · not a qualification probability
          </div>
          <ScoreRing score={score} />
          <div
            className={`font-display font-semibold mt-2 ${labelTone === "success" ? "text-success" : labelTone === "warning" ? "text-warning" : "text-destructive"}`}
          >
            {result.match_label}
          </div>
          <div className="mt-6 grid grid-cols-2 gap-4 w-full pt-5 border-t border-border">
            <Stat
              label="ALIGNMENT INDEX"
              value={`${result.alignment_index ?? result.match_percentage}/100`}
              accent
            />
            <Stat label="TECHNICAL FIT (DENSE)" value={`${result.dense_score}%`} />
            <Stat label="KEYWORD MATCH (BM25)" value={`${result.bm25_score}%`} />
            <Stat label="KEYWORD COVERAGE" value={`${result.keyword_coverage}%`} />
            <Stat label="CONTEXT EVIDENCE" value={`${result.positional_skill_score}%`} />
            <Stat label="EXPERIENCE EVIDENCE" value={`${result.experience_skill_score}%`} />
          </div>
          <p className="relative mt-5 text-xs leading-relaxed text-muted-foreground">
            {result.score_disclaimer}
          </p>
        </section>

        <section className="glass rounded-xl p-7 relative">
          <span className="absolute top-0 left-7 right-7 h-px bg-gradient-to-r from-transparent via-success to-transparent" />
          <div className="flex items-center gap-3 mb-3">
            <div className="size-9 rounded-md bg-success/15 border border-success/30 grid place-items-center">
              <Lightbulb className="size-4 text-success" />
            </div>
            <h2 className="font-display font-semibold text-xl">JD vs Resume Alignment</h2>
            <span className="ml-auto font-mono-label text-success">
              SIGNAL AGREEMENT: {result.confidence.toFixed(2)}
            </span>
          </div>
          <p className="text-foreground/90 leading-relaxed">{result.alignment_summary}</p>
          {result.alignment_gap && (
            <p className="text-muted-foreground leading-relaxed mt-3 text-sm">
              {result.alignment_gap}
            </p>
          )}
          <div className="mt-5 grid grid-cols-3 gap-3">
            <MiniStat label="Experience" value={yearsExp} />
            <MiniStat
              label="Education"
              value={section?.has_education ? "Found in resume" : "Not found"}
              tone={section?.has_education ? "success" : undefined}
            />
            <MiniStat
              label="Resume Quality"
              value={quality ? `${Math.round(quality.quality_score)}%` : "—"}
            />
          </div>
        </section>
      </div>

      {/* Skills */}
      <div className="grid lg:grid-cols-2 gap-6">
        <section className="glass rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2.5">
              <CheckCircle2 className="size-5 text-success" />
              <h3 className="font-display font-semibold">Evidenced Skills</h3>
            </div>
            <span className="font-mono-label text-muted-foreground">
              {result.matched_skills.length} MATCHED
            </span>
          </div>
          {result.matched_skills.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {result.matched_skills.map((s) => {
                const evidence = evidenceFor(s);
                return (
                  <span
                    key={s}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-success/10 border border-success/30 text-success text-xs font-mono"
                  >
                    <CheckCircle2 className="size-3" /> {s}
                    {evidence?.section && (
                      <em className="not-italic text-success/70">· {evidence.section}</em>
                    )}
                  </span>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              No matched skills detected for this job description.
            </p>
          )}
        </section>

        <section className="glass rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2.5">
              <CircleAlert className="size-5 text-warning" />
              <h3 className="font-display font-semibold">Skills Not Evidenced</h3>
            </div>
            <span className="font-mono-label text-muted-foreground">
              {result.missing_skills.length} TO REVIEW
            </span>
          </div>
          {result.missing_skills.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {result.missing_skills.map((s) => (
                <span
                  key={s}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-warning/10 border border-warning/30 text-warning text-xs font-mono"
                >
                  <CircleAlert className="size-3" /> {s}
                </span>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Every extracted role skill has supporting resume evidence. Confirm during human
              review.
            </p>
          )}

          {result.mandatory_missing.length > 0 && (
            <div className="mt-5 rounded-md border border-warning/30 bg-warning/5 p-3.5 text-sm">
              <div className="font-mono-label text-warning mb-1">CRITICAL_GAP</div>
              <div className="text-foreground/90">
                <span className="font-semibold">{result.mandatory_missing.join(", ")}</span>{" "}
                {result.mandatory_missing.length > 1 ? "are" : "is"} marked as required for this
                role. Recommend technical screening to assess these gaps before moving forward.
              </div>
            </div>
          )}
        </section>
      </div>

      {/* Recommendations */}
      <section className="glass rounded-xl p-7">
        <div className="flex items-center gap-2.5 mb-5">
          <div className="size-9 rounded-md bg-primary/15 border border-primary/30 grid place-items-center">
            <Wand2 className="size-4 text-primary-glow" />
          </div>
          <h3 className="font-display font-semibold text-xl">AI Recommendations</h3>
          <span className="ml-auto font-mono-label text-muted-foreground">
            {Math.min(3, result.recommendations.length)} ACTIONS
          </span>
        </div>
        {result.recommendations.length > 0 ? (
          <div className="grid md:grid-cols-3 gap-4">
            {result.recommendations.slice(0, 3).map((rec, i) => (
              <RecCard
                key={i}
                icon={recIcons[i % recIcons.length]}
                title={`Recommendation ${i + 1}`}
                body={rec}
              />
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            No specific recommendations — this resume is well-aligned with the role.
          </p>
        )}
      </section>

      {/* Funnel */}
      <section className="glass rounded-xl p-7">
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-display font-semibold text-xl">Talent Acquisition Funnel</h3>
          <span
            className={`font-mono-label ${result.funnel[0]?.done ? "text-success" : "text-warning"}`}
          >
            {result.funnel[0]?.done ? "SCREENING_PASSED" : "NEEDS_REVIEW"}
          </span>
        </div>
        <div className="grid grid-cols-4 gap-3">
          {result.funnel.map((p, i) => (
            <div key={i} className="space-y-2">
              <div
                className={`h-1 rounded-full ${p.done ? "bg-gradient-to-r from-success to-primary-glow" : "bg-surface-3"}`}
              />
              <div
                className={`font-display font-semibold ${p.done ? "text-success" : "text-foreground"}`}
              >
                {p.stage}
              </div>
              <div
                className={`text-xs font-mono ${p.done ? "text-success" : "text-muted-foreground"}`}
              >
                {p.status}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function ResumeReviewView({
  result,
  fileName,
  file,
  onNewScan,
}: {
  result: ResumeReviewResult;
  fileName: string | null;
  file: File | null;
  onNewScan: () => void;
}) {
  const [selectedAtsKey, setSelectedAtsKey] = useState(
    result.ats_compatibility_profiles?.[0]?.key ?? "",
  );
  const selectedAts =
    result.ats_compatibility_profiles?.find((profile) => profile.key === selectedAtsKey) ??
    result.ats_compatibility_profiles?.[0];
  const averageAtsCompatibility = result.ats_compatibility_profiles?.length
    ? Math.round(
        result.ats_compatibility_profiles.reduce((total, profile) => total + profile.score, 0) /
          result.ats_compatibility_profiles.length,
      )
    : 0;
  const sectionItems = [
    ["Summary", result.section_analysis.has_summary],
    ["Experience", result.section_analysis.has_experience],
    ["Education", result.section_analysis.has_education],
    ["Skills", result.section_analysis.has_skills],
    ["Projects", result.section_analysis.has_projects],
    ["Certifications", result.section_analysis.has_certifications],
  ] as const;

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="font-mono-label text-success">// resume_review_complete</div>
          <h1 className="mt-1 text-4xl font-bold tracking-tight md:text-5xl">
            Resume <span className="text-gradient-primary">Intelligence Report</span>
          </h1>
          <p className="mt-2 font-mono text-xs text-muted-foreground">
            REVIEW_ID: {result.review_id} · FILE: {result.resume_filename || fileName} ·{" "}
            {result.processing_time_seconds.toFixed(2)}s
          </p>
        </div>
        <button
          onClick={onNewScan}
          className="inline-flex h-10 items-center gap-2 rounded-md border border-success/40 bg-success/10 px-4 text-sm font-semibold text-success transition hover:bg-success/15"
        >
          <Sparkles className="size-4" /> New Review
        </button>
      </header>

      <div className="flex items-start gap-3 rounded-xl border border-primary/25 bg-primary/5 p-4">
        <ShieldCheck className="mt-0.5 size-5 shrink-0 text-primary-glow" />
        <div>
          <div className="text-sm font-semibold">Resume-only analysis</div>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            No job description was used and no job-match percentage was calculated. Suggested roles
            are based only on skills explicitly detected in the uploaded resume.
          </p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[0.8fr_1.2fr]">
        <section className="glass relative flex flex-col items-center overflow-hidden rounded-xl p-7 text-center">
          <div className="absolute inset-0 grid-bg opacity-30 pointer-events-none" />
          <div className="font-mono-label relative text-muted-foreground">RESUME_HEALTH</div>
          <ScoreRing score={Math.round(result.resume_health_score)} label="HEALTH_SCORE" />
          <p className="relative max-w-sm text-sm leading-relaxed text-muted-foreground">
            Combined document quality, ATS readability, and core-section completeness.
          </p>
          <div className="relative mt-5 grid w-full grid-cols-2 gap-3 border-t border-border pt-5">
            <MiniStat
              label="ATS Readability"
              value={`${Math.round(result.resume_quality.ats_format_score)}%`}
            />
            <MiniStat
              label="Section Coverage"
              value={`${Math.round(result.section_analysis.completeness_score)}%`}
            />
            <MiniStat label="Word Count" value={`${result.resume_quality.word_count}`} />
            <MiniStat
              label="Experience"
              value={`${result.experience_info.estimated_years.toFixed(1)} years`}
            />
          </div>
        </section>

        <section className="glass rounded-xl p-7">
          <div className="flex items-center gap-3">
            <div className="grid size-9 place-items-center rounded-md border border-success/30 bg-success/15">
              <Lightbulb className="size-4 text-success" />
            </div>
            <div>
              <h2 className="font-display text-xl font-semibold">Profile overview</h2>
              <div className="mt-0.5 font-mono-label text-muted-foreground">
                {result.experience_info.seniority_level} profile
              </div>
            </div>
          </div>
          <p className="mt-5 leading-relaxed text-foreground/90">{result.review_summary}</p>
          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            {result.strengths.map((strength) => (
              <div
                key={strength}
                className="flex gap-2.5 rounded-lg border border-success/20 bg-success/5 p-3.5 text-sm"
              >
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" />
                <span>{strength}</span>
              </div>
            ))}
          </div>
        </section>
      </div>

      <ResumeAnnotationViewer file={file} />

      {result.ats_compatibility_profiles?.length > 0 && (
        <section className="glass relative overflow-hidden rounded-2xl border-primary/20">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-64 bg-[radial-gradient(circle_at_80%_0%,hsl(var(--primary)/0.12),transparent_52%)]" />
          <div className="relative grid gap-6 border-b border-border/80 p-6 md:p-8 lg:grid-cols-[1fr_auto] lg:items-end">
            <div className="max-w-3xl">
              <div className="flex items-center gap-2 font-mono-label text-primary-glow">
                <span className="size-1.5 rounded-full bg-primary shadow-[0_0_12px_hsl(var(--primary))]" />
                ATS COMPATIBILITY MATRIX
              </div>
              <h2 className="mt-3 font-display text-2xl font-semibold tracking-tight md:text-3xl">
                See where this resume parses cleanly.
              </h2>
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
                Six ATS-oriented profiles inspect the same resume evidence with different
                priorities. Choose a profile to understand its strengths and open risks.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/[0.06] px-3 py-1.5 font-mono-label text-primary-glow">
                  <ShieldCheck className="size-3.5" />
                  Deterministic checks
                </span>
                <span className="inline-flex items-center rounded-full border border-success/20 bg-success/[0.06] px-3 py-1.5 font-mono-label text-success">
                  Zero LLM API cost
                </span>
              </div>
            </div>
            <div className="flex items-stretch gap-2">
              <div className="min-w-28 rounded-xl border border-primary/25 bg-primary/10 px-4 py-3">
                <div className="font-mono-label text-muted-foreground">Average</div>
                <div className="mt-1 font-mono text-2xl font-bold text-primary-glow">
                  {averageAtsCompatibility}
                  <span className="ml-0.5 text-xs text-muted-foreground">/100</span>
                </div>
              </div>
              <div className="min-w-28 rounded-xl border border-border bg-surface-2/55 px-4 py-3">
                <div className="font-mono-label text-muted-foreground">Open risks</div>
                <div className="mt-1 font-mono text-2xl font-bold text-foreground">
                  {result.formatting_diagnostics?.length ?? 0}
                </div>
              </div>
            </div>
          </div>

          <div
            className="relative grid snap-x snap-mandatory auto-cols-[minmax(248px,82vw)] grid-flow-col gap-3 overflow-x-auto p-4 pb-5 [scrollbar-color:hsl(var(--primary))_hsl(var(--border)/0.5)] [scrollbar-width:thin] sm:grid-flow-row sm:auto-cols-auto sm:grid-cols-2 sm:overflow-visible sm:p-6 sm:[scrollbar-width:auto] lg:grid-cols-3 xl:grid-cols-6"
            role="group"
            aria-label="ATS compatibility profiles"
          >
            {result.ats_compatibility_profiles.map((profile, index) => {
              const selected = profile.key === selectedAts?.key;
              const scoreTone =
                profile.score >= 70
                  ? "text-success"
                  : profile.score >= 50
                    ? "text-warning"
                    : "text-destructive";
              const scoreBar =
                profile.score >= 70
                  ? "bg-gradient-to-r from-primary to-primary-glow"
                  : profile.score >= 50
                    ? "bg-gradient-to-r from-amber-500 to-warning"
                    : "bg-gradient-to-r from-red-600 to-destructive";
              return (
                <button
                  type="button"
                  key={profile.key}
                  aria-pressed={selected}
                  onClick={() => setSelectedAtsKey(profile.key)}
                  className={`group relative min-h-44 min-w-0 snap-start overflow-hidden rounded-xl border p-4 text-left transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary sm:snap-none ${
                    selected
                      ? "-translate-y-0.5 border-primary/50 bg-primary/[0.09] shadow-[0_16px_36px_-24px_hsl(var(--primary)/0.75)]"
                      : "border-border/80 bg-surface-2/45 hover:-translate-y-0.5 hover:border-primary/30 hover:bg-surface-2/80"
                  }`}
                >
                  {selected && (
                    <span className="absolute inset-x-5 top-0 h-px bg-gradient-to-r from-transparent via-primary to-transparent" />
                  )}
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-mono-label text-muted-foreground">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <span
                      className={`rounded-full border px-2 py-0.5 font-mono text-[8px] font-semibold uppercase tracking-[0.14em] transition ${
                        selected
                          ? "border-primary/35 bg-primary/10 text-primary-glow"
                          : "border-border/70 text-muted-foreground/70 group-hover:border-primary/20"
                      }`}
                    >
                      {selected ? "Selected" : "Profile"}
                    </span>
                  </div>
                  <div className="mt-4">
                    <div className="flex items-end justify-between gap-2">
                      <div className="flex items-baseline gap-1">
                        <span
                          className={`font-mono text-3xl font-semibold tracking-tight ${scoreTone}`}
                        >
                          {Math.round(profile.score)}
                        </span>
                        <span className="font-mono text-[9px] text-muted-foreground">/100</span>
                      </div>
                      <span className="font-mono-label text-muted-foreground">Score</span>
                    </div>
                    <div className="mt-2 h-1 overflow-hidden rounded-full bg-border/70">
                      <div
                        className={`h-full rounded-full transition-[width] duration-500 ${scoreBar}`}
                        style={{ width: `${Math.max(4, Math.min(profile.score, 100))}%` }}
                      />
                    </div>
                    <span className="mt-4 block min-h-8 min-w-0 break-words font-display text-[13px] font-semibold leading-tight [overflow-wrap:anywhere]">
                      {profile.name}
                    </span>
                  </div>
                  <div className="mt-5 flex items-center justify-between border-t border-border/70 pt-3">
                    <span className="font-mono-label text-muted-foreground">Checks</span>
                    <span className={`font-mono text-xs font-semibold ${scoreTone}`}>
                      {profile.checks_passed}/{profile.checks_total} passed
                    </span>
                  </div>
                </button>
              );
            })}
          </div>

          {selectedAts && (
            <div className="relative border-t border-border/80 bg-[linear-gradient(135deg,hsl(var(--surface-2)/0.55),transparent_60%)] p-4 sm:p-6 md:p-8">
              <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
                <div className="rounded-xl border border-primary/20 bg-primary/[0.045] p-5 md:p-6">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <div className="grid size-11 place-items-center rounded-lg border border-primary/30 bg-primary/10 shadow-[0_0_24px_-12px_hsl(var(--primary))]">
                        <Gauge className="size-5 text-primary-glow" />
                      </div>
                      <div>
                        <div className="font-mono-label text-muted-foreground">
                          Selected profile
                        </div>
                        <h3 className="mt-1 font-display text-lg font-semibold">
                          {selectedAts.name}
                        </h3>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-mono text-2xl font-bold text-primary-glow">
                        {Math.round(selectedAts.score)}
                      </div>
                      <div className="font-mono-label text-success">{selectedAts.label}</div>
                    </div>
                  </div>
                  <p className="mt-5 text-sm leading-relaxed text-muted-foreground">
                    {selectedAts.description}
                  </p>
                  <div className="mt-5 grid grid-cols-2 gap-2">
                    <div className="rounded-lg border border-border/70 bg-surface/55 px-3 py-2.5">
                      <div className="font-mono-label text-muted-foreground">Passed</div>
                      <div className="mt-1 font-mono text-sm font-semibold text-success">
                        {selectedAts.checks_passed} checks
                      </div>
                    </div>
                    <div className="rounded-lg border border-border/70 bg-surface/55 px-3 py-2.5">
                      <div className="font-mono-label text-muted-foreground">Review</div>
                      <div className="mt-1 font-mono text-sm font-semibold text-foreground">
                        {selectedAts.diagnostics.length} items
                      </div>
                    </div>
                  </div>
                </div>

                <div className="rounded-xl border border-border bg-surface/45 p-5 md:p-6">
                  <div className="mb-4 flex items-center justify-between">
                    <div>
                      <div className="font-mono-label text-muted-foreground">Evidence review</div>
                      <h3 className="mt-1 font-display font-semibold">What this profile checks</h3>
                    </div>
                    <span className="rounded-full border border-border bg-surface-2/60 px-3 py-1 font-mono-label text-muted-foreground">
                      {selectedAts.diagnostics.length} open
                    </span>
                  </div>
                  {selectedAts.diagnostics.length > 0 ? (
                    <div className="space-y-2.5">
                      {selectedAts.diagnostics.slice(0, 4).map((diagnostic) => (
                        <div
                          key={diagnostic.key}
                          className="rounded-lg border border-warning/20 bg-warning/[0.045] p-4 transition hover:border-warning/35"
                        >
                          <div className="flex items-start gap-3">
                            <CircleAlert className="mt-0.5 size-4 shrink-0 text-warning" />
                            <div>
                              <div className="text-sm font-semibold">{diagnostic.title}</div>
                              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                                {diagnostic.detail}
                              </p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="flex min-h-32 items-center gap-4 rounded-lg border border-success/25 bg-success/[0.045] p-5">
                      <div className="grid size-10 shrink-0 place-items-center rounded-full border border-success/30 bg-success/10">
                        <CheckCircle2 className="size-5 text-success" />
                      </div>
                      <div>
                        <div className="text-sm font-semibold text-success">All checks passed</div>
                        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                          No parsing risks were found for this compatibility profile.
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="mt-5 flex gap-3 rounded-xl border border-border/80 bg-surface-2/25 p-4 text-xs leading-relaxed text-muted-foreground">
                <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary-glow" />
                <span>{result.ats_compatibility_disclaimer}</span>
              </div>
            </div>
          )}
        </section>
      )}

      {result.formatting_diagnostics?.length > 0 && (
        <section className="glass rounded-xl p-6 md:p-7">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <div className="font-mono-label text-warning">PRIORITIZED_FIXES</div>
              <h2 className="mt-2 font-display text-2xl font-semibold">
                Fix the highest-impact parsing risks first
              </h2>
            </div>
            <span className="font-mono-label text-muted-foreground">
              {result.formatting_diagnostics.length} open checks
            </span>
          </div>
          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            {result.formatting_diagnostics.slice(0, 6).map((diagnostic, index) => (
              <article
                key={diagnostic.key}
                className="rounded-lg border border-border bg-surface-2/30 p-5"
              >
                <div className="flex items-start gap-4">
                  <div
                    className={`grid size-9 shrink-0 place-items-center rounded-md border font-mono text-xs font-bold ${
                      diagnostic.severity === "critical"
                        ? "border-destructive/35 bg-destructive/10 text-destructive"
                        : diagnostic.severity === "important"
                          ? "border-warning/35 bg-warning/10 text-warning"
                          : "border-primary/30 bg-primary/10 text-primary-glow"
                    }`}
                  >
                    {String(index + 1).padStart(2, "0")}
                  </div>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-display font-semibold">{diagnostic.title}</h3>
                      <span className="rounded-full border border-border px-2 py-0.5 font-mono-label text-muted-foreground">
                        {diagnostic.category}
                      </span>
                    </div>
                    <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                      {diagnostic.detail}
                    </p>
                    <p className="mt-3 text-sm leading-relaxed text-foreground/90">
                      {diagnostic.recommendation}
                    </p>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="glass rounded-xl p-6">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <Radar className="size-5 text-primary-glow" />
              <h3 className="font-display font-semibold">Detected Skills</h3>
            </div>
            <span className="font-mono-label text-muted-foreground">
              {result.extracted_skills.length} FOUND
            </span>
          </div>
          {result.extracted_skills.length ? (
            <div className="flex flex-wrap gap-2">
              {result.extracted_skills.map((skill) => (
                <span
                  key={skill}
                  className="rounded-full border border-primary/25 bg-primary/10 px-3 py-1.5 font-mono text-xs text-primary-glow"
                >
                  {skill}
                </span>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              No explicit skills section could be detected.
            </p>
          )}
        </section>

        <section className="glass rounded-xl p-6">
          <div className="mb-4 flex items-center gap-2.5">
            <FileText className="size-5 text-success" />
            <h3 className="font-display font-semibold">Section Coverage</h3>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {sectionItems.map(([label, found]) => (
              <div
                key={label}
                className={`rounded-lg border p-3 ${
                  found ? "border-success/25 bg-success/5" : "border-border bg-surface-2/30"
                }`}
              >
                <div className="flex items-center gap-2 text-sm font-medium">
                  {found ? (
                    <CheckCircle2 className="size-4 text-success" />
                  ) : (
                    <CircleAlert className="size-4 text-muted-foreground" />
                  )}
                  {label}
                </div>
                <div className="mt-1 font-mono-label text-muted-foreground">
                  {found ? "Detected" : "Not detected"}
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      <section className="glass rounded-xl p-7">
        <div className="mb-5 flex items-center gap-2.5">
          <Briefcase className="size-5 text-primary-glow" />
          <h3 className="font-display text-xl font-semibold">Evidence-backed Role Suggestions</h3>
        </div>
        {result.suggested_roles.length ? (
          <div className="grid gap-4 md:grid-cols-3">
            {result.suggested_roles.map((role) => (
              <article
                key={role.title}
                className="rounded-lg border border-border bg-surface-2/30 p-5"
              >
                <div className="font-display font-semibold">{role.title}</div>
                <div className="mt-1 font-mono-label text-success">
                  {role.evidence_count} skill signals
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {role.matching_skills.map((skill) => (
                    <span
                      key={skill}
                      className="rounded-full border border-border bg-surface/60 px-2.5 py-1 text-[11px]"
                    >
                      {skill}
                    </span>
                  ))}
                </div>
              </article>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Add a clear skills section to receive evidence-backed role-family suggestions.
          </p>
        )}
      </section>

      <section className="glass rounded-xl p-7">
        <div className="mb-5 flex items-center gap-2.5">
          <Wand2 className="size-5 text-primary-glow" />
          <h3 className="font-display text-xl font-semibold">Resume Improvements</h3>
        </div>
        {result.recommendations.length > 0 ? (
          <div className="grid gap-4 md:grid-cols-3">
            {result.recommendations.slice(0, 6).map((recommendation, index) => (
              <RecCard
                key={recommendation}
                icon={[Target, Gauge, Lightbulb][index % 3]}
                title={`Priority ${index + 1}`}
                body={recommendation}
              />
            ))}
          </div>
        ) : (
          <div className="flex gap-3 rounded-lg border border-success/25 bg-success/5 p-5">
            <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-success" />
            <div>
              <p className="font-display font-semibold text-success">
                No high-priority improvements identified
              </p>
              <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                This resume meets the current ATS, structure, evidence, and readability checks.
                Continue reviewing the candidate evidence manually before making a hiring decision.
              </p>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

function MiniStat({ label, value, tone }: { label: string; value: string; tone?: "success" }) {
  return (
    <div className="rounded-md border border-border bg-surface-2/30 px-3 py-2.5">
      <div className="font-mono-label text-muted-foreground">{label}</div>
      <div
        className={`mt-1 text-sm font-semibold ${tone === "success" ? "text-success" : "text-foreground"}`}
      >
        {value}
      </div>
    </div>
  );
}

function RecCard({ icon: Icon, title, body }: { icon: LucideIcon; title: string; body: string }) {
  return (
    <div className="rounded-lg border border-border bg-surface-2/30 p-5 hover:border-primary/40 transition">
      <div className="flex items-center gap-2.5">
        <div className="size-8 rounded-md bg-primary/15 border border-primary/30 grid place-items-center">
          <Icon className="size-4 text-primary-glow" />
        </div>
        <div className="font-display font-semibold">{title}</div>
      </div>
      <p className="text-sm text-muted-foreground mt-3 leading-relaxed">{body}</p>
    </div>
  );
}

function ScoreRing({ score, label = "MATCH_SCORE" }: { score: number; label?: string }) {
  const r = 84;
  const c = 2 * Math.PI * r;
  const off = c - (score / 100) * c;
  return (
    <div className="relative my-4">
      <svg width="220" height="220" viewBox="0 0 220 220" className="-rotate-90">
        <defs>
          <linearGradient id="ring" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="oklch(0.74 0.20 152)" />
            <stop offset="100%" stopColor="oklch(0.72 0.20 258)" />
          </linearGradient>
        </defs>
        <circle
          cx="110"
          cy="110"
          r={r}
          stroke="oklch(0.30 0.04 256)"
          strokeWidth="10"
          fill="none"
        />
        <circle
          cx="110"
          cy="110"
          r={r}
          stroke="url(#ring)"
          strokeWidth="10"
          fill="none"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={off}
          style={{ filter: "drop-shadow(0 0 14px oklch(0.74 0.20 152 / 0.7))" }}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center">
        <div className="text-center">
          <div className="font-display text-5xl font-bold text-gradient-primary">{score}%</div>
          <div className="font-mono-label text-muted-foreground mt-1">{label}</div>
        </div>
      </div>
    </div>
  );
}

function seedJD(role: string) {
  return `Role: ${role}
We are hiring a ${role} to join a high-performing team. The ideal candidate has 7+ years of relevant experience, strong cross-functional leadership, and a track record of shipping at scale.

Responsibilities
- Drive end-to-end execution from discovery through launch
- Partner with engineering, design and data on roadmap
- Mentor junior team members and raise the quality bar

Required
- Deep expertise in modern web technologies
- Strong communication and stakeholder management
- Experience in regulated or high-stakes domains

Nice to have
- Cloud infrastructure (AWS preferred)
- Experience scaling teams beyond 25 people
`;
}
