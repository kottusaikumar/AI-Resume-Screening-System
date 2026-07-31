import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  BriefcaseBusiness,
  Check,
  ChevronRight,
  FileText,
  Files,
  GitCompareArrows,
  Loader2,
  Plus,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Target,
  Trash2,
  UploadCloud,
  UserRoundSearch,
  UsersRound,
  X,
} from "lucide-react";
import {
  analyzeCandidatePool,
  analyzeRolePortfolio,
  ApiError,
  type RoleComparisonInput,
  type ScreeningResult,
} from "@/lib/api";
import { downloadCsv } from "@/lib/csv";
import { useExport } from "@/lib/scanner-context";
import { useAuth } from "@/lib/auth-context";
import { extractScannedPdfText } from "@/lib/browser-ocr";

export const Route = createFileRoute("/_layout/compare")({
  head: () => ({ meta: [{ title: "Match Lab — NeuralRecruit" }] }),
  component: MatchLabPage,
});

type CompareMode = "candidate-pool" | "role-portfolio";
type RunState = "setup" | "running" | "results";

interface RoleDraft extends RoleComparisonInput {
  id: string;
}

interface ComparisonItem {
  rank: number;
  name: string;
  context: string;
  result: ScreeningResult;
}

interface ComparisonRun {
  mode: CompareMode;
  subject: string;
  items: ComparisonItem[];
  failed: string[];
}

const MAX_ITEMS = 10;
const ALLOWED_EXTENSIONS = [".pdf", ".docx", ".txt"];

const MODE_META = {
  "candidate-pool": {
    eyebrow: "Talent shortlist",
    title: "Many resumes · one role",
    description: "Rank a candidate pool against one consistent role brief.",
    icon: UsersRound,
    action: "Rank candidate pool",
  },
  "role-portfolio": {
    eyebrow: "Career mobility",
    title: "One resume · many roles",
    description: "Discover which open role best matches one candidate profile.",
    icon: BriefcaseBusiness,
    action: "Compare role fit",
  },
} as const;

function createRole(index: number): RoleDraft {
  return { id: crypto.randomUUID(), title: `Role ${index}`, description: "", mandatory_skills: "" };
}

function fileExtension(filename: string) {
  const dot = filename.lastIndexOf(".");
  return dot >= 0 ? filename.slice(dot).toLowerCase() : "";
}

function scoreTone(score: number) {
  if (score >= 75) return "text-success";
  if (score >= 55) return "text-warning";
  return "text-destructive";
}

function scoreFill(score: number) {
  if (score >= 75) return "bg-success";
  if (score >= 55) return "bg-warning";
  return "bg-destructive";
}

function formatSize(bytes: number) {
  return bytes >= 1024 * 1024
    ? `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function MatchLabPage() {
  const { setExportConfig } = useExport();
  const { ensureAccess } = useAuth();
  const [mode, setMode] = useState<CompareMode>("candidate-pool");
  const [runState, setRunState] = useState<RunState>("setup");
  const [candidateFiles, setCandidateFiles] = useState<File[]>([]);
  const [jobDescription, setJobDescription] = useState("");
  const [mandatorySkills, setMandatorySkills] = useState("");
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [roles, setRoles] = useState<RoleDraft[]>([createRole(1), createRole(2)]);
  const [comparison, setComparison] = useState<ComparisonRun | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [processingMessage, setProcessingMessage] = useState("Preparing secure comparison…");

  const selected = comparison?.items[selectedIndex] ?? null;
  const meta = MODE_META[mode];
  const validRoles = roles.filter(
    (role) => role.title.trim() && role.description.trim().length >= 20,
  );
  const canRun =
    mode === "candidate-pool"
      ? candidateFiles.length >= 2 && jobDescription.trim().length >= 20
      : Boolean(resumeFile) && validRoles.length >= 2;

  const inputSummary = useMemo(() => {
    if (mode === "candidate-pool") {
      return `${candidateFiles.length}/${MAX_ITEMS} resumes · ${jobDescription.trim().length.toLocaleString()} JD characters`;
    }
    return `${resumeFile ? "1 resume" : "No resume"} · ${validRoles.length}/${MAX_ITEMS} ready roles`;
  }, [candidateFiles.length, jobDescription, mode, resumeFile, validRoles.length]);

  useEffect(() => {
    if (!comparison?.items.length) {
      setExportConfig(null);
      return;
    }
    setExportConfig(() => {
      downloadCsv(
        comparison.mode === "candidate-pool"
          ? "candidate-pool-ranking.csv"
          : "role-portfolio-ranking.csv",
        [
          [
            "Rank",
            comparison.mode === "candidate-pool" ? "Candidate file" : "Role",
            "Match %",
            "Match label",
            "Signal agreement %",
            "Skill coverage %",
            "Missing skills",
            "Decision status",
          ],
          ...comparison.items.map((item) => [
            item.rank,
            item.name,
            item.result.match_percentage,
            item.result.match_label,
            item.result.confidence,
            item.result.keyword_coverage,
            item.result.missing_skills.join("; "),
            item.result.decision_status,
          ]),
        ],
      );
    }, "comparison ranking");
    return () => setExportConfig(null);
  }, [comparison, setExportConfig]);

  const switchMode = (nextMode: CompareMode) => {
    setMode(nextMode);
    setRunState("setup");
    setComparison(null);
    setSelectedIndex(0);
    setError(null);
  };

  const addCandidateFiles = (incoming: File[]) => {
    const valid = incoming.filter((file) => ALLOWED_EXTENSIONS.includes(fileExtension(file.name)));
    if (valid.length !== incoming.length) {
      setError("Only PDF, DOCX, and TXT resumes are supported.");
    } else {
      setError(null);
    }
    setCandidateFiles((current) => {
      const existing = new Set(current.map((file) => `${file.name}:${file.size}`));
      const unique = valid.filter((file) => !existing.has(`${file.name}:${file.size}`));
      return [...current, ...unique].slice(0, MAX_ITEMS);
    });
  };

  const updateRole = (id: string, patch: Partial<RoleDraft>) => {
    setRoles((current) => current.map((role) => (role.id === id ? { ...role, ...patch } : role)));
  };

  const resetRun = () => {
    setRunState("setup");
    setComparison(null);
    setSelectedIndex(0);
    setError(null);
  };

  const runComparison = async () => {
    if (!canRun) return;
    setRunState("running");
    setComparison(null);
    setError(null);
    setProcessingMessage("Connecting to the private analysis workspace…");
    try {
      const hasAccess = await ensureAccess();
      if (!hasAccess) {
        throw new ApiError("The comparison workspace is temporarily unavailable.");
      }

      if (mode === "candidate-pool") {
        const browserExtractedTexts: Array<string | undefined> = [];
        for (let index = 0; index < candidateFiles.length; index += 1) {
          const candidate = candidateFiles[index];
          const extracted = await extractScannedPdfText(candidate, ({ message }) => {
            setProcessingMessage(`Candidate ${index + 1} of ${candidateFiles.length}: ${message}`);
          });
          browserExtractedTexts.push(extracted);
        }
        setProcessingMessage("Analysing and ranking candidate evidence…");
        const response = await analyzeCandidatePool(
          candidateFiles,
          jobDescription,
          mandatorySkills,
          browserExtractedTexts,
        );
        setComparison({
          mode,
          subject: "Shared role brief",
          failed: response.failed,
          items: response.candidates.map((candidate) => ({
            rank: candidate.rank,
            name: candidate.result.resume_filename,
            context: `${candidate.result.experience_info?.seniority_level ?? "Seniority unknown"} · ${
              candidate.result.experience_info?.estimated_years ?? 0
            } yrs detected`,
            result: candidate.result,
          })),
        });
      } else if (resumeFile) {
        const browserExtractedText = await extractScannedPdfText(resumeFile, ({ message }) =>
          setProcessingMessage(message),
        );
        setProcessingMessage("Comparing the resume with each role…");
        const response = await analyzeRolePortfolio(
          resumeFile,
          validRoles.map(({ title, description, mandatory_skills }) => ({
            title,
            description,
            mandatory_skills,
          })),
          browserExtractedText,
        );
        setComparison({
          mode,
          subject: response.resume_filename,
          failed: response.failed,
          items: response.roles.map((role) => ({
            rank: role.rank,
            name: role.role_title,
            context: role.result.required_years
              ? `${role.result.required_years}+ years requested`
              : "Experience requirement not specified",
            result: role.result,
          })),
        });
      }
      setSelectedIndex(0);
      setRunState("results");
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Comparison could not be completed.");
      setRunState("setup");
    }
  };

  return (
    <div className="space-y-7">
      <header className="relative overflow-hidden glass rounded-2xl px-6 py-7 md:px-8 md:py-9">
        <div className="absolute inset-y-0 right-0 w-1/2 bg-[radial-gradient(circle_at_center,oklch(0.62_0.20_258/0.16),transparent_68%)]" />
        <div className="relative max-w-3xl">
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/25 bg-primary/10 px-3 py-1 font-mono-label text-primary-glow">
            <GitCompareArrows className="size-3.5" /> Match Lab
          </div>
          <h1 className="mt-4 text-4xl md:text-5xl font-bold tracking-tight">
            Compare talent with <span className="text-gradient-primary">clear evidence</span>
          </h1>
          <p className="mt-3 max-w-2xl text-muted-foreground leading-relaxed">
            Build a candidate shortlist or map one candidate across open roles. Every ranking keeps
            the supporting signals visible and requires recruiter review.
          </p>
          <div className="mt-5 flex flex-wrap gap-4 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <ShieldCheck className="size-4 text-success" /> Blind screening on
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Target className="size-4 text-primary-glow" /> Same scoring rubric
            </span>
            <span className="inline-flex items-center gap-1.5">
              <UserRoundSearch className="size-4 text-warning" /> Human decision required
            </span>
          </div>
        </div>
      </header>

      <section className="grid lg:grid-cols-2 gap-3" aria-label="Comparison mode">
        {(Object.keys(MODE_META) as CompareMode[]).map((option) => {
          const optionMeta = MODE_META[option];
          const Icon = optionMeta.icon;
          const active = mode === option;
          return (
            <button
              key={option}
              onClick={() => switchMode(option)}
              className={`group text-left rounded-xl border p-5 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 ${
                active
                  ? "border-primary/60 bg-primary/10 shadow-[0_12px_36px_-24px_var(--color-primary)]"
                  : "border-border bg-surface/40 hover:border-primary/30 hover:bg-surface-2/50"
              }`}
            >
              <div className="flex items-start gap-4">
                <div
                  className={`size-11 rounded-xl grid place-items-center border ${
                    active
                      ? "border-primary/40 bg-primary/15 text-primary-glow"
                      : "border-border bg-surface-2 text-muted-foreground"
                  }`}
                >
                  <Icon className="size-5" />
                </div>
                <div className="min-w-0">
                  <div className="font-mono-label text-muted-foreground">{optionMeta.eyebrow}</div>
                  <div className="mt-1 font-display font-semibold text-lg">{optionMeta.title}</div>
                  <p className="mt-1 text-sm text-muted-foreground">{optionMeta.description}</p>
                </div>
                <span
                  className={`ml-auto mt-1 size-5 rounded-full border grid place-items-center ${
                    active ? "border-primary bg-primary text-primary-foreground" : "border-border"
                  }`}
                >
                  {active && <Check className="size-3" />}
                </span>
              </div>
            </button>
          );
        })}
      </section>

      {error && (
        <div className="rounded-xl border border-destructive/35 bg-destructive/10 px-4 py-3 flex items-start gap-3">
          <AlertTriangle className="size-4 text-destructive mt-0.5 shrink-0" />
          <div className="text-sm">{error}</div>
        </div>
      )}

      {runState === "running" ? (
        <ProcessingPanel
          mode={mode}
          count={mode === "candidate-pool" ? candidateFiles.length : validRoles.length}
          message={processingMessage}
        />
      ) : runState === "results" && comparison ? (
        <ResultsWorkspace
          comparison={comparison}
          selectedIndex={selectedIndex}
          onSelect={setSelectedIndex}
          selected={selected}
          onReset={resetRun}
        />
      ) : (
        <section className="grid xl:grid-cols-[minmax(0,1fr)_320px] gap-5 items-start">
          <div className="glass rounded-2xl p-5 md:p-7">
            <div className="flex items-center justify-between gap-4 border-b border-border pb-5">
              <div>
                <div className="font-mono-label text-primary-glow">01 · Prepare comparison</div>
                <h2 className="mt-1 text-xl font-semibold">{meta.title}</h2>
              </div>
              <span className="hidden sm:inline-flex rounded-full border border-border bg-surface-2/60 px-3 py-1 text-xs text-muted-foreground">
                {inputSummary}
              </span>
            </div>

            {mode === "candidate-pool" ? (
              <div className="mt-6 space-y-6">
                <div>
                  <FieldHeading
                    step="A"
                    title="Candidate resumes"
                    hint={`Add 2–${MAX_ITEMS} text-based files`}
                  />
                  <label
                    htmlFor="candidate-pool-files"
                    onDragEnter={() => setDragActive(true)}
                    onDragLeave={() => setDragActive(false)}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={(event) => {
                      event.preventDefault();
                      setDragActive(false);
                      addCandidateFiles(Array.from(event.dataTransfer.files));
                    }}
                    className={`mt-3 min-h-40 rounded-xl border border-dashed grid place-items-center cursor-pointer transition ${
                      dragActive
                        ? "border-primary bg-primary/10"
                        : "border-border bg-surface-2/25 hover:border-primary/45 hover:bg-primary/5"
                    }`}
                  >
                    <input
                      id="candidate-pool-files"
                      type="file"
                      multiple
                      accept=".pdf,.docx,.txt"
                      className="hidden"
                      onChange={(event) => addCandidateFiles(Array.from(event.target.files ?? []))}
                    />
                    <div className="text-center px-5 py-7">
                      <div className="mx-auto size-11 rounded-xl border border-primary/25 bg-primary/10 grid place-items-center">
                        <UploadCloud className="size-5 text-primary-glow" />
                      </div>
                      <div className="mt-3 text-sm font-semibold">Drop candidate resumes here</div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        or click to browse · PDF, DOCX, TXT · 10 MB each
                      </div>
                    </div>
                  </label>
                  {candidateFiles.length > 0 && (
                    <div className="mt-3 grid sm:grid-cols-2 gap-2">
                      {candidateFiles.map((file) => (
                        <div
                          key={`${file.name}:${file.size}`}
                          className="rounded-lg border border-border bg-surface-2/35 px-3 py-2.5 flex items-center gap-3"
                        >
                          <FileText className="size-4 text-primary-glow shrink-0" />
                          <div className="min-w-0">
                            <div className="text-xs font-medium truncate">{file.name}</div>
                            <div className="text-[11px] text-muted-foreground">
                              {formatSize(file.size)}
                            </div>
                          </div>
                          <button
                            onClick={() =>
                              setCandidateFiles((current) =>
                                current.filter((candidate) => candidate !== file),
                              )
                            }
                            className="ml-auto rounded-md p-1 text-muted-foreground hover:bg-surface-3 hover:text-foreground"
                            aria-label={`Remove ${file.name}`}
                          >
                            <X className="size-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div>
                  <FieldHeading
                    step="B"
                    title="Shared role brief"
                    hint="Used consistently for every candidate"
                  />
                  <textarea
                    value={jobDescription}
                    onChange={(event) => setJobDescription(event.target.value)}
                    rows={9}
                    placeholder="Paste the responsibilities, outcomes, required experience, and skills for this role…"
                    className="mt-3 w-full resize-y rounded-xl border border-border bg-surface-2/30 px-4 py-3 text-sm leading-relaxed outline-none transition focus:border-primary/60 focus:ring-2 focus:ring-primary/10"
                  />
                  <div className="mt-2 flex justify-between text-[11px] text-muted-foreground">
                    <span>Minimum 20 characters</span>
                    <span>{jobDescription.length.toLocaleString()} characters</span>
                  </div>
                </div>

                <div>
                  <FieldHeading
                    step="C"
                    title="Mandatory skills"
                    hint="Optional · comma separated"
                  />
                  <input
                    value={mandatorySkills}
                    onChange={(event) => setMandatorySkills(event.target.value)}
                    placeholder="e.g. Python, Kubernetes, stakeholder management"
                    className="mt-3 h-11 w-full rounded-xl border border-border bg-surface-2/30 px-4 text-sm outline-none transition focus:border-primary/60 focus:ring-2 focus:ring-primary/10"
                  />
                </div>
              </div>
            ) : (
              <div className="mt-6 space-y-6">
                <div>
                  <FieldHeading step="A" title="Candidate resume" hint="One consistent profile" />
                  <label
                    htmlFor="role-portfolio-resume"
                    className="mt-3 rounded-xl border border-dashed border-border bg-surface-2/25 px-4 py-5 flex items-center gap-4 cursor-pointer hover:border-primary/45 hover:bg-primary/5 transition"
                  >
                    <input
                      id="role-portfolio-resume"
                      type="file"
                      accept=".pdf,.docx,.txt"
                      className="hidden"
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (!file) return;
                        if (!ALLOWED_EXTENSIONS.includes(fileExtension(file.name))) {
                          setError("Only PDF, DOCX, and TXT resumes are supported.");
                          return;
                        }
                        setResumeFile(file);
                        setError(null);
                      }}
                    />
                    <div className="size-11 rounded-xl border border-primary/25 bg-primary/10 grid place-items-center shrink-0">
                      {resumeFile ? (
                        <FileText className="size-5 text-success" />
                      ) : (
                        <UploadCloud className="size-5 text-primary-glow" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-semibold truncate">
                        {resumeFile?.name ?? "Select candidate resume"}
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        {resumeFile ? formatSize(resumeFile.size) : "PDF, DOCX, TXT · 10 MB max"}
                      </div>
                    </div>
                    <span className="ml-auto text-xs font-medium text-primary-glow">
                      {resumeFile ? "Replace" : "Browse"}
                    </span>
                  </label>
                </div>

                <div>
                  <div className="flex items-center justify-between gap-3">
                    <FieldHeading
                      step="B"
                      title="Role portfolio"
                      hint={`Add 2–${MAX_ITEMS} job descriptions`}
                    />
                    <button
                      onClick={() =>
                        roles.length < MAX_ITEMS &&
                        setRoles((current) => [...current, createRole(current.length + 1)])
                      }
                      disabled={roles.length >= MAX_ITEMS}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 h-9 text-xs font-medium hover:border-primary/40 hover:bg-primary/5 disabled:opacity-40"
                    >
                      <Plus className="size-3.5" /> Add role
                    </button>
                  </div>
                  <div className="mt-3 space-y-3">
                    {roles.map((role, index) => (
                      <div
                        key={role.id}
                        className="rounded-xl border border-border bg-surface-2/25 p-4"
                      >
                        <div className="flex items-center gap-3">
                          <span className="size-7 rounded-lg bg-primary/10 border border-primary/20 grid place-items-center font-mono text-xs text-primary-glow">
                            {index + 1}
                          </span>
                          <input
                            value={role.title}
                            onChange={(event) => updateRole(role.id, { title: event.target.value })}
                            placeholder="Role title"
                            className="h-9 flex-1 min-w-0 border-b border-border bg-transparent text-sm font-semibold outline-none focus:border-primary"
                          />
                          <button
                            onClick={() =>
                              roles.length > 2 &&
                              setRoles((current) => current.filter((item) => item.id !== role.id))
                            }
                            disabled={roles.length <= 2}
                            className="rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-30"
                            aria-label={`Remove ${role.title}`}
                          >
                            <Trash2 className="size-3.5" />
                          </button>
                        </div>
                        <textarea
                          value={role.description}
                          onChange={(event) =>
                            updateRole(role.id, { description: event.target.value })
                          }
                          rows={4}
                          placeholder="Paste this role's responsibilities, required experience, and skills…"
                          className="mt-3 w-full resize-y rounded-lg border border-border bg-background/20 px-3 py-2.5 text-xs leading-relaxed outline-none focus:border-primary/60"
                        />
                        <input
                          value={role.mandatory_skills ?? ""}
                          onChange={(event) =>
                            updateRole(role.id, { mandatory_skills: event.target.value })
                          }
                          placeholder="Mandatory skills (optional)"
                          className="mt-2 h-9 w-full rounded-lg border border-border bg-background/20 px-3 text-xs outline-none focus:border-primary/60"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          <aside className="glass rounded-2xl p-5 sticky top-5">
            <div className="font-mono-label text-primary-glow">02 · Review & run</div>
            <div className="mt-4 rounded-xl border border-border bg-surface-2/35 p-4">
              <div className="flex items-center gap-3">
                <div className="size-9 rounded-lg bg-primary/10 border border-primary/20 grid place-items-center">
                  <meta.icon className="size-4 text-primary-glow" />
                </div>
                <div>
                  <div className="text-sm font-semibold">{meta.eyebrow}</div>
                  <div className="text-[11px] text-muted-foreground">{inputSummary}</div>
                </div>
              </div>
            </div>
            <div className="mt-5 space-y-3 text-xs">
              <ReadinessRow
                ready={mode === "candidate-pool" ? candidateFiles.length >= 2 : Boolean(resumeFile)}
                label={mode === "candidate-pool" ? "At least two resumes" : "Candidate resume"}
              />
              <ReadinessRow
                ready={
                  mode === "candidate-pool"
                    ? jobDescription.trim().length >= 20
                    : validRoles.length >= 2
                }
                label={
                  mode === "candidate-pool" ? "Shared role brief" : "At least two complete roles"
                }
              />
              <ReadinessRow ready label="Blind screening enabled" />
              <ReadinessRow ready label="Human review required" />
            </div>
            <button
              onClick={runComparison}
              disabled={!canRun}
              className="mt-6 w-full h-12 rounded-xl bg-gradient-to-r from-primary to-primary-glow text-primary-foreground text-sm font-semibold flex items-center justify-center gap-2 glow-primary transition hover:opacity-95 disabled:opacity-40 disabled:shadow-none"
            >
              <Sparkles className="size-4" /> {meta.action} <ArrowRight className="size-4" />
            </button>
            {!canRun && (
              <p className="mt-3 text-center text-[11px] text-muted-foreground">
                Complete both required inputs to continue.
              </p>
            )}
            <div className="mt-5 pt-4 border-t border-border text-[11px] leading-relaxed text-muted-foreground">
              Rankings are advisory signals. Review original evidence and use a structured human
              process before making candidate decisions.
            </div>
          </aside>
        </section>
      )}
    </div>
  );
}

function FieldHeading({ step, title, hint }: { step: string; title: string; hint: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="size-6 rounded-md border border-primary/25 bg-primary/10 grid place-items-center font-mono text-[10px] text-primary-glow">
        {step}
      </span>
      <div className="text-sm font-semibold">{title}</div>
      <div className="ml-auto text-[11px] text-muted-foreground">{hint}</div>
    </div>
  );
}

function ReadinessRow({ ready, label }: { ready: boolean; label: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <span
        className={`size-5 rounded-full border grid place-items-center ${
          ready
            ? "border-success/40 bg-success/10 text-success"
            : "border-border text-muted-foreground"
        }`}
      >
        {ready ? <Check className="size-3" /> : <span className="size-1 rounded-full bg-current" />}
      </span>
      <span className={ready ? "text-foreground/85" : "text-muted-foreground"}>{label}</span>
    </div>
  );
}

function ProcessingPanel({
  mode,
  count,
  message,
}: {
  mode: CompareMode;
  count: number;
  message: string;
}) {
  const labels =
    mode === "candidate-pool"
      ? ["Extracting candidate evidence", "Applying one consistent rubric", "Building shortlist"]
      : ["Extracting candidate evidence", "Comparing role requirements", "Building fit portfolio"];
  return (
    <section className="glass rounded-2xl min-h-[440px] grid place-items-center p-8">
      <div className="max-w-md w-full text-center">
        <div className="relative mx-auto size-20">
          <div className="absolute inset-0 rounded-2xl border border-primary/30 bg-primary/10 animate-pulse" />
          <div className="absolute inset-3 rounded-xl bg-gradient-to-br from-primary to-primary-glow grid place-items-center glow-primary">
            <GitCompareArrows className="size-7 text-primary-foreground" />
          </div>
        </div>
        <div className="mt-6 font-mono-label text-primary-glow">Comparison in progress</div>
        <h2 className="mt-2 text-2xl font-semibold">Evaluating {count} matches</h2>
        <p className="mt-2 text-sm text-muted-foreground">{message}</p>
        <div className="mt-7 space-y-2 text-left">
          {labels.map((label, index) => (
            <div
              key={label}
              className="rounded-lg border border-border bg-surface-2/35 px-4 py-3 flex items-center gap-3"
            >
              {index === 0 ? (
                <Loader2 className="size-4 animate-spin text-primary-glow" />
              ) : (
                <span className="size-4 rounded-full border border-border" />
              )}
              <span className="text-xs">{label}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function ResultsWorkspace({
  comparison,
  selectedIndex,
  onSelect,
  selected,
  onReset,
}: {
  comparison: ComparisonRun;
  selectedIndex: number;
  onSelect: (index: number) => void;
  selected: ComparisonItem | null;
  onReset: () => void;
}) {
  const top = comparison.items[0];
  const average = comparison.items.length
    ? comparison.items.reduce((sum, item) => sum + item.result.match_percentage, 0) /
      comparison.items.length
    : 0;

  return (
    <div className="space-y-5">
      <section className="grid sm:grid-cols-3 gap-3">
        <SummaryCard
          label="Comparisons"
          value={comparison.items.length.toString()}
          detail={comparison.mode === "candidate-pool" ? "candidate profiles" : "role briefs"}
          icon={Files}
        />
        <SummaryCard
          label="Top match"
          value={`${Math.round(top?.result.match_percentage ?? 0)}%`}
          detail={top?.name ?? "No completed matches"}
          icon={Sparkles}
          accent
        />
        <SummaryCard
          label="Pool average"
          value={`${Math.round(average)}%`}
          detail="advisory signal only"
          icon={Target}
        />
      </section>

      {comparison.failed.length > 0 && (
        <div className="rounded-xl border border-warning/35 bg-warning/10 px-4 py-3">
          <div className="text-xs font-semibold text-warning">
            {comparison.failed.length} item{comparison.failed.length === 1 ? "" : "s"} could not be
            processed
          </div>
          <div className="mt-1 text-xs text-muted-foreground">{comparison.failed.join(" · ")}</div>
        </div>
      )}

      <section className="grid xl:grid-cols-[minmax(0,1.35fr)_minmax(340px,0.65fr)] gap-5 items-start">
        <div className="glass rounded-2xl overflow-hidden">
          <div className="px-5 py-4 border-b border-border flex items-center justify-between">
            <div>
              <div className="font-mono-label text-primary-glow">Ranked comparison</div>
              <h2 className="mt-1 font-semibold">
                {comparison.mode === "candidate-pool"
                  ? "Candidate shortlist"
                  : "Role fit portfolio"}
              </h2>
            </div>
            <button
              onClick={onReset}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 h-9 text-xs hover:bg-surface-2"
            >
              <RotateCcw className="size-3.5" /> New comparison
            </button>
          </div>
          <div className="divide-y divide-border">
            {comparison.items.map((item, index) => {
              const active = selectedIndex === index;
              return (
                <button
                  key={`${item.rank}:${item.name}`}
                  onClick={() => onSelect(index)}
                  className={`w-full text-left px-4 md:px-5 py-4 transition ${
                    active ? "bg-primary/10" : "hover:bg-surface-2/35"
                  }`}
                >
                  <div className="flex items-center gap-4">
                    <div
                      className={`size-9 rounded-xl border grid place-items-center font-mono text-sm ${
                        item.rank === 1
                          ? "border-success/35 bg-success/10 text-success"
                          : "border-border bg-surface-2 text-muted-foreground"
                      }`}
                    >
                      {item.rank}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <div className="font-semibold truncate">{item.name}</div>
                        {item.rank === 1 && (
                          <span className="rounded-full bg-success/10 border border-success/25 px-2 py-0.5 text-[10px] font-mono text-success">
                            TOP SIGNAL
                          </span>
                        )}
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground truncate">
                        {item.context}
                      </div>
                      <div className="mt-2.5 h-1.5 rounded-full bg-surface-3 overflow-hidden">
                        <div
                          className={`h-full rounded-full ${scoreFill(item.result.match_percentage)}`}
                          style={{ width: `${item.result.match_percentage}%` }}
                        />
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div
                        className={`font-display text-2xl font-bold ${scoreTone(item.result.match_percentage)}`}
                      >
                        {Math.round(item.result.match_percentage)}%
                      </div>
                      <div className="text-[10px] text-muted-foreground">
                        {item.result.match_label}
                      </div>
                    </div>
                    <ChevronRight
                      className={`size-4 shrink-0 ${active ? "text-primary-glow" : "text-muted-foreground"}`}
                    />
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {selected && <EvidencePanel item={selected} subject={comparison.subject} />}
      </section>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  detail,
  icon: Icon,
  accent = false,
}: {
  label: string;
  value: string;
  detail: string;
  icon: typeof Target;
  accent?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border p-5 ${accent ? "border-primary/35 bg-primary/10" : "glass"}`}
    >
      <div className="flex items-center justify-between">
        <div className="font-mono-label text-muted-foreground">{label}</div>
        <Icon className={`size-4 ${accent ? "text-primary-glow" : "text-muted-foreground"}`} />
      </div>
      <div className="mt-3 text-3xl font-display font-bold">{value}</div>
      <div className="mt-1 text-xs text-muted-foreground truncate">{detail}</div>
    </div>
  );
}

function EvidencePanel({ item, subject }: { item: ComparisonItem; subject: string }) {
  const signals = [
    ["Semantic", item.result.dense_score],
    ["Keywords", item.result.bm25_score],
    ["Skill coverage", item.result.keyword_coverage],
    ["Resume quality", item.result.combined_resume_quality_score],
  ] as const;
  return (
    <aside className="glass rounded-2xl p-5 xl:sticky xl:top-5">
      <div className="flex items-start gap-3">
        <div className="size-10 rounded-xl border border-primary/30 bg-primary/10 grid place-items-center">
          <UserRoundSearch className="size-5 text-primary-glow" />
        </div>
        <div className="min-w-0">
          <div className="font-mono-label text-primary-glow">Evidence inspector</div>
          <h3 className="mt-1 font-semibold truncate">{item.name}</h3>
          <div className="text-[11px] text-muted-foreground truncate">Compared with {subject}</div>
        </div>
      </div>

      <div className="mt-5 rounded-xl border border-border bg-surface-2/30 p-4">
        <div className="flex items-end justify-between">
          <div>
            <div className="text-[11px] text-muted-foreground">Overall match signal</div>
            <div className={`mt-1 text-3xl font-bold ${scoreTone(item.result.match_percentage)}`}>
              {Math.round(item.result.match_percentage)}%
            </div>
          </div>
          <div className="text-right">
            <div className="text-xs font-medium">{item.result.match_label}</div>
            <div className="mt-1 text-[10px] text-warning">Human review required</div>
          </div>
        </div>
      </div>

      <div className="mt-5 space-y-3">
        {signals.map(([label, value]) => (
          <div key={label}>
            <div className="flex justify-between text-[11px] mb-1">
              <span className="text-muted-foreground">{label}</span>
              <span className="font-mono">{Math.round(value)}%</span>
            </div>
            <div className="h-1.5 rounded-full bg-surface-3 overflow-hidden">
              <div className="h-full rounded-full bg-primary" style={{ width: `${value}%` }} />
            </div>
          </div>
        ))}
      </div>

      <div className="mt-5">
        <div className="font-mono-label text-muted-foreground">Matched evidence</div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {item.result.matched_skills.slice(0, 7).map((skill) => (
            <span
              key={skill}
              className="rounded-md border border-success/25 bg-success/10 px-2 py-1 text-[10px] text-success"
            >
              {skill}
            </span>
          ))}
          {item.result.matched_skills.length === 0 && (
            <span className="text-xs text-muted-foreground">
              No explicit skill matches detected.
            </span>
          )}
        </div>
      </div>

      <div className="mt-5">
        <div className="font-mono-label text-muted-foreground">Review gaps</div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {item.result.missing_skills.slice(0, 7).map((skill) => (
            <span
              key={skill}
              className="rounded-md border border-warning/25 bg-warning/10 px-2 py-1 text-[10px] text-warning"
            >
              {skill}
            </span>
          ))}
          {item.result.missing_skills.length === 0 && (
            <span className="text-xs text-muted-foreground">No explicit skill gaps detected.</span>
          )}
        </div>
      </div>

      <div className="mt-5 rounded-lg border border-border bg-background/20 p-3 text-xs leading-relaxed text-muted-foreground">
        {item.result.alignment_summary}
      </div>
    </aside>
  );
}
