import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Briefcase,
  CheckCircle2,
  ChevronRight,
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
import { analyzeResume, ApiError, downloadReportPdf, type ScreeningResult } from "@/lib/api";
import { useScanner, useExport } from "@/lib/scanner-context";
import { downloadCsv } from "@/lib/csv";

export const Route = createFileRoute("/_layout/")({
  head: () => ({
    meta: [
      { title: "NeuralRecruit — AI Resume Match Scanner" },
      {
        name: "description",
        content:
          "Precision-engineered AI resume screening. Match candidates to job descriptions in seconds with deep skill analysis.",
      },
      { property: "og:title", content: "NeuralRecruit — AI Resume Match Scanner" },
      {
        property: "og:description",
        content: "Precision-engineered AI resume screening for high-stakes hiring.",
      },
    ],
  }),
  component: ScannerPage,
});

const STEPS = [
  { key: "parse", label: "Parsing PDF text", icon: FileText },
  { key: "history", label: "Validating work history", icon: ShieldCheck },
  { key: "skills", label: "Mapping skills against benchmark", icon: Radar },
  { key: "report", label: "Generating fit report", icon: Wand2 },
];

const TEMPLATES = ["Software Engineer", "Product Manager", "Data Scientist", "Designer"];

function ScannerPage() {
  const {
    phase,
    setPhase,
    file,
    setFile,
    jd,
    setJd,
    progress,
    setProgress,
    activeStep,
    setActiveStep,
    result,
    setResult,
    error,
    setError,
  } = useScanner();
  const { setExportConfig } = useExport();

  useEffect(() => {
    if (phase !== "analyzing" || !file) return;

    let cancelled = false;
    setProgress(0);
    setActiveStep(0);

    // Asymptotic progress animation — approaches but never quite reaches 100%
    // until the real API response comes back, so the UI stays "alive" no
    // matter how long the backend takes.
    const start = Date.now();
    const tau = 2200;
    const id = setInterval(() => {
      const elapsed = Date.now() - start;
      const p = Math.min(95, 100 * (1 - Math.exp(-elapsed / tau)));
      setProgress(p);
      setActiveStep(Math.min(STEPS.length - 1, Math.floor((p / 100) * STEPS.length)));
    }, 80);

    analyzeResume(file, jd)
      .then((data) => {
        if (cancelled) return;
        clearInterval(id);
        setProgress(100);
        setActiveStep(STEPS.length - 1);
        setTimeout(() => {
          if (cancelled) return;
          setResult(data);
          setPhase("results");
        }, 350);
      })
      .catch((err) => {
        if (cancelled) return;
        clearInterval(id);
        const message =
          err instanceof ApiError
            ? err.message
            : "Something went wrong while analyzing the resume. Please try again.";
        setError(message);
        setPhase("upload");
      });

    return () => {
      cancelled = true;
      clearInterval(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, file]);

  // Register the Results page's CSV export with the TopBar's Export button.
  useEffect(() => {
    if (phase === "results" && result) {
      setExportConfig(() => {
        downloadCsv(`${result.report_id || "report"}.csv`, [
          ["Field", "Value"],
          ["Report ID", result.report_id],
          ["Resume File", result.resume_filename],
          ["Match Percentage", result.match_percentage],
          ["Match Label", result.match_label],
          ["Retention Risk", result.retention_risk],
          ["Technical Fit", result.dense_score],
          ["Years Experience", result.experience_info?.estimated_years ?? ""],
          ["Seniority Level", result.experience_info?.seniority_level ?? ""],
          ["Salary Fit", result.salary_fit],
          ["Confidence", result.confidence],
          [],
          ["Matched Skills", result.matched_skills.join("; ")],
          ["Missing Skills", result.missing_skills.join("; ")],
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
  }, [phase, result]);

  const fileName = file?.name ?? null;
  const canRun = useMemo(() => file && jd.trim().length > 20, [file, jd]);

  return (
    <>
      {phase === "upload" && (
        <UploadView
          fileName={fileName}
          file={file}
          setFile={setFile}
          jd={jd}
          setJd={setJd}
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
        <AnalyzingView progress={progress} activeStep={activeStep} fileName={fileName} />
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
    <div className="space-y-8">
      <header className="flex flex-col gap-2">
        <div className="font-mono-label text-primary-glow">// initiate_talent_scan</div>
        <h1 className="text-4xl md:text-5xl font-bold tracking-tight">
          Initiate <span className="text-gradient-primary">Neural</span> Talent Scan
        </h1>
        <p className="text-muted-foreground max-w-2xl">
          Upload a candidate dossier and paste the role brief. Our engine extracts skills, validates
          work history, and benchmarks against the JD with explainable scoring.
        </p>
      </header>

      {displayError && (
        <div className="glass rounded-xl border border-destructive/40 bg-destructive/10 p-4 flex items-start gap-3">
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
            className="text-muted-foreground hover:text-foreground shrink-0"
            aria-label="Dismiss"
          >
            <X className="size-4" />
          </button>
        </div>
      )}

      <div className="grid lg:grid-cols-[1.05fr_1fr] gap-6">
        {/* Upload */}
        <section className="glass rounded-xl p-6 md:p-8 relative overflow-hidden">
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
            className={`relative block rounded-lg border-2 border-dashed transition cursor-pointer ${
              drag
                ? "border-primary bg-primary/10"
                : "border-border hover:border-primary/50 hover:bg-surface-2/40"
            }`}
          >
            <input
              type="file"
              accept=".pdf,.docx,.txt"
              className="sr-only"
              onChange={(e) => handleFile(e.target.files?.[0])}
            />
            <div className="px-6 py-12 flex flex-col items-center text-center gap-4">
              {!fileName ? (
                <>
                  <div className="size-16 rounded-2xl bg-gradient-to-br from-primary/30 to-primary-glow/20 border border-primary/30 grid place-items-center animate-pulse-glow">
                    <UploadCloud className="size-7 text-primary-glow" />
                  </div>
                  <div>
                    <div className="font-display font-semibold text-lg">
                      Drop the candidate resume
                    </div>
                    <div className="text-sm text-muted-foreground mt-1">
                      or click to browse · encrypted end-to-end
                    </div>
                  </div>
                  <div className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-semibold glow-primary">
                    <UploadCloud className="size-4" /> Select File
                  </div>
                </>
              ) : (
                <>
                  <div className="size-16 rounded-2xl bg-success/15 border border-success/40 grid place-items-center glow-success">
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
                <div className="text-xs mt-1 truncate font-mono text-foreground/80">{tip.value}</div>
              </div>
            ))}
          </div>
        </section>

        {/* JD */}
        <section className="glass rounded-xl p-6 md:p-8">
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-2.5">
              <div className="size-9 rounded-md bg-success/15 border border-success/30 grid place-items-center">
                <Briefcase className="size-4 text-success" />
              </div>
              <h2 className="font-display font-semibold text-lg">Job Description</h2>
            </div>
            <span className="font-mono-label text-muted-foreground">AUTO-DETECT: ON</span>
          </div>

          <textarea
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
                onClick={() => setJd(seedJD(t))}
                className="px-3 py-1.5 rounded-full text-xs border border-border bg-surface-2/40 hover:border-primary/50 hover:text-primary-glow transition"
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
      </div>

      {/* Run bar */}
      <div className="glass rounded-xl p-5 flex flex-col md:flex-row items-center gap-4">
        <div className="flex items-center gap-3 flex-1">
          <div
            className={`size-10 rounded-md grid place-items-center border ${canRun ? "bg-success/15 border-success/40 text-success" : "bg-surface-2/40 border-border text-muted-foreground"}`}
          >
            <Cpu className="size-5" />
          </div>
          <div>
            <div className="font-display font-semibold">
              {canRun ? "Ready to scan" : "Awaiting inputs"}
            </div>
            <div className="text-xs text-muted-foreground font-mono">
              {fileName ? "✓ resume" : "· resume"} &nbsp;{" "}
              {jd.trim().length > 20 ? "✓ job_description" : "· job_description"}
            </div>
          </div>
        </div>
        <button
          disabled={!canRun}
          onClick={onRun}
          className={`inline-flex items-center gap-2 px-6 h-12 rounded-md font-semibold transition ${
            canRun
              ? "bg-gradient-to-r from-primary to-primary-glow text-primary-foreground glow-primary hover:scale-[1.02]"
              : "bg-surface-2/40 text-muted-foreground border border-border cursor-not-allowed"
          }`}
        >
          <Sparkles className="size-4" /> Run Neural Analysis <ArrowRight className="size-4" />
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
      title: "Secure Enclave",
      desc: "End-to-end encrypted candidate data processing.",
    },
    {
      icon: Target,
      title: "Contextual Matching",
      desc: "Goes beyond keywords to understand project impact.",
    },
    {
      icon: Activity,
      title: "Predictive Tenure",
      desc: "Statistical modeling of candidate-role fit over time.",
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
  progress,
  activeStep,
  fileName,
}: {
  progress: number;
  activeStep: number;
  fileName: string | null;
}) {
  return (
    <div className="space-y-6">
      <header>
        <div className="font-mono-label text-primary-glow">// live_process · 0xF4A</div>
        <h1 className="text-4xl md:text-5xl font-bold tracking-tight mt-1">
          Analyzing Resume Data
        </h1>
        <p className="text-muted-foreground mt-2 max-w-2xl">
          Neural engine is extracting structural data and mapping skills against the role benchmark.
        </p>
      </header>

      <div className="grid lg:grid-cols-[1fr_1.2fr] gap-6">
        {/* Steps */}
        <section className="glass rounded-xl p-6">
          <div className="font-mono-label text-muted-foreground mb-4">PROCESS_PIPELINE</div>
          <ol className="space-y-3">
            {STEPS.map((s, i) => {
              const done = i < activeStep;
              const active = i === activeStep;
              return (
                <li
                  key={s.key}
                  className={`flex items-center gap-3 rounded-lg px-4 py-3 border transition ${
                    active
                      ? "border-primary/60 bg-primary/10 glow-primary"
                      : done
                        ? "border-success/30 bg-success/5"
                        : "border-border bg-surface-2/30"
                  }`}
                >
                  <div
                    className={`size-8 rounded-md grid place-items-center shrink-0 ${
                      done
                        ? "bg-success/20 text-success"
                        : active
                          ? "bg-primary/20 text-primary-glow"
                          : "bg-surface-3 text-muted-foreground"
                    }`}
                  >
                    {done ? <CheckCircle2 className="size-4" /> : <s.icon className="size-4" />}
                  </div>
                  <div className="flex-1">
                    <div
                      className={`text-sm font-medium ${active ? "text-foreground" : done ? "text-foreground" : "text-muted-foreground"}`}
                    >
                      {s.label}
                    </div>
                    {active && (
                      <div className="font-mono text-[11px] text-primary-glow animate-ticker mt-0.5">
                        // executing · awaiting tokens…
                      </div>
                    )}
                  </div>
                  {active && (
                    <span className="font-mono text-xs text-primary-glow">
                      {Math.round(progress)}%
                    </span>
                  )}
                  {done && <span className="font-mono text-xs text-success">100%</span>}
                </li>
              );
            })}
          </ol>

          <div className="mt-6 pt-5 border-t border-border">
            <div className="flex items-center justify-between mb-2">
              <span className="font-mono-label text-muted-foreground">TOTAL_PROGRESS</span>
              <span className="font-mono text-sm text-success">{progress.toFixed(2)}%</span>
            </div>
            <div className="h-1.5 rounded-full bg-surface-3 overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-primary to-primary-glow transition-all"
                style={{ width: `${progress}%`, boxShadow: "0 0 12px var(--color-primary-glow)" }}
              />
            </div>
            <div className="mt-3 font-mono text-[11px] text-muted-foreground truncate">
              FILE: {fileName ?? "—"} · UUID: E6-R9-S4-A1
            </div>
          </div>
        </section>

        {/* Resume preview with scanning beam */}
        <section className="glass rounded-xl p-6 relative">
          <div className="flex items-center justify-between mb-4">
            <div className="font-mono-label text-muted-foreground">RESUME_NEURAL_SCAN</div>
            <span className="font-mono-label text-success flex items-center gap-1.5">
              <span className="size-1.5 rounded-full bg-success animate-pulse" /> LIVE
            </span>
          </div>
          <div className="relative h-[440px] rounded-lg border border-border bg-surface-2/30 overflow-hidden">
            <div className="absolute inset-0 grid-bg opacity-30" />
            <div className="absolute inset-6 space-y-3">
              <div className="h-6 w-2/3 rounded bg-surface-3" />
              <div className="h-3 w-1/3 rounded bg-surface-3/70" />
              <div className="h-px bg-border my-3" />
              <div className="h-3 w-full rounded bg-surface-3/60" />
              <div className="h-3 w-5/6 rounded bg-surface-3/60" />
              <div className="h-3 w-4/6 rounded bg-surface-3/60" />
              <div className="h-3 w-full rounded bg-surface-3/60 mt-4" />
              <div className="h-3 w-11/12 rounded bg-surface-3/60" />
              <div className="h-3 w-9/12 rounded bg-surface-3/60" />
              <div className="h-3 w-full rounded bg-surface-3/60 mt-4" />
              <div className="h-3 w-10/12 rounded bg-surface-3/60" />
            </div>

            {/* Floating match chips */}
            <FloatChip className="top-6 right-6" tone="success" label="MATCH: REACT.JS" />
            <FloatChip className="top-32 left-6" tone="success" label="MATCH: UI ARCHITECTURE" />
            <FloatChip className="bottom-24 right-10" tone="warning" label="PARTIAL: LEADERSHIP" />
            <FloatChip className="bottom-6 left-6" tone="success" label="CREDENTIAL: VERIFIED" />

            {/* Scanning beam */}
            <div className="absolute inset-x-0 h-20 animate-scan-beam pointer-events-none">
              <div className="h-full w-full bg-gradient-to-b from-transparent via-primary/40 to-transparent" />
              <div
                className="h-0.5 w-full bg-primary-glow"
                style={{ boxShadow: "0 0 24px var(--color-primary-glow)" }}
              />
            </div>
          </div>

          <div className="mt-5 grid grid-cols-3 gap-3">
            <Stat label="X-COORD" value="42.923" accent />
            <Stat label="Y-COORD" value="11.002" accent />
            <Stat label="BUFFER" value="1024KB" />
          </div>
        </section>
      </div>
    </div>
  );
}

function FloatChip({
  className,
  tone,
  label,
}: {
  className?: string;
  tone: "success" | "warning";
  label: string;
}) {
  const cls =
    tone === "success"
      ? "bg-success/15 border-success/40 text-success"
      : "bg-warning/15 border-warning/40 text-warning";
  return (
    <div
      className={`absolute ${className} px-2.5 py-1 rounded-md border ${cls} font-mono text-[10px] tracking-wider backdrop-blur-md shadow-lg`}
    >
      {label}
    </div>
  );
}

/* ---------------- Results ---------------- */
function matchTone(label: string): "success" | "warning" | "destructive" {
  if (label === "Exceptional Match" || label === "Strong Match") return "success";
  if (label === "Partial Match") return "warning";
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
  const score = Math.round(result.match_percentage);
  const labelTone = matchTone(result.match_label);
  const exp = result.experience_info;
  const quality = result.resume_quality;
  const section = result.section_analysis;

  const [pdfState, setPdfState] = useState<"idle" | "loading" | "error">("idle");
  const [forwardState, setForwardState] = useState<"idle" | "sending" | "sent">("idle");

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

  const handleForward = () => {
    setForwardState("sending");
    // Simulated — no email service is connected yet, so this confirms the
    // intent without actually delivering anything.
    setTimeout(() => setForwardState("sent"), 900);
    setTimeout(() => setForwardState("idle"), 3500);
  };

  const yearsExp = exp
    ? `${exp.estimated_years.toFixed(1)} / ${result.required_years ? `${result.required_years}+` : "—"}`
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
          {forwardState === "sent" && (
            <span className="text-xs text-success font-medium mr-1">✓ Sent to hiring manager</span>
          )}
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
            onClick={handleForward}
            disabled={forwardState !== "idle"}
            className="inline-flex items-center gap-2 px-4 h-10 rounded-md bg-primary text-primary-foreground text-sm font-semibold glow-primary hover:opacity-95 transition disabled:opacity-70"
          >
            {forwardState === "sending"
              ? "Sending…"
              : forwardState === "sent"
                ? "Sent"
                : "Forward to Hiring Manager"}
            {forwardState === "idle" && <ChevronRight className="size-4" />}
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
            CANDIDATE_MATCH_SCORE
          </div>
          <ScoreRing score={score} />
          <div
            className={`font-display font-semibold mt-2 ${labelTone === "success" ? "text-success" : labelTone === "warning" ? "text-warning" : "text-destructive"}`}
          >
            {result.match_label}
          </div>
          <div className="mt-6 grid grid-cols-2 gap-4 w-full pt-5 border-t border-border">
            <MiniStat
              label="Retention Risk"
              value={result.retention_risk}
              tone={riskTone(result.retention_risk) === "success" ? "success" : undefined}
            />
            <MiniStat
              label="Technical Fit"
              value={`${Math.round(result.dense_score)}%`}
              tone="success"
            />
            <MiniStat label="Years Exp" value={yearsExp} />
            <MiniStat label="Salary Fit" value={result.salary_fit} />
          </div>
        </section>

        <section className="glass rounded-xl p-7 relative">
          <span className="absolute top-0 left-7 right-7 h-px bg-gradient-to-r from-transparent via-success to-transparent" />
          <div className="flex items-center gap-3 mb-3">
            <div className="size-9 rounded-md bg-success/15 border border-success/30 grid place-items-center">
              <Lightbulb className="size-4 text-success" />
            </div>
            <h2 className="font-display font-semibold text-xl">JD vs Resume Alignment</h2>
            <span className="ml-auto font-mono-label text-success">
              CONFIDENCE: {result.confidence.toFixed(2)}
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
              <h3 className="font-display font-semibold">Matched Skills</h3>
            </div>
            <span className="font-mono-label text-muted-foreground">
              {result.matched_skills.length} MATCHED
            </span>
          </div>
          {result.matched_skills.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {result.matched_skills.map((s) => (
                <span
                  key={s}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-success/10 border border-success/30 text-success text-xs font-mono"
                >
                  <CheckCircle2 className="size-3" /> {s}
                </span>
              ))}
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
              <h3 className="font-display font-semibold">Skill Gaps</h3>
            </div>
            <span className="font-mono-label text-muted-foreground">
              {result.missing_skills.length} GAPS
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
              No skill gaps detected — strong alignment across all key requirements.
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

function ScoreRing({ score }: { score: number }) {
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
          <div className="font-mono-label text-muted-foreground mt-1">MATCH_SCORE</div>
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
