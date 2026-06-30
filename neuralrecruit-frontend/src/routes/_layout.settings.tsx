import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  RotateCcw,
  Save,
  Server,
  SlidersHorizontal,
} from "lucide-react";
import {
  fetchSettings,
  saveSettings,
  resetSettings,
  ApiError,
  type ScoringWeights,
} from "@/lib/api";

export const Route = createFileRoute("/_layout/settings")({
  head: () => ({ meta: [{ title: "Settings — NeuralRecruit" }] }),
  component: SettingsPage,
});

const API_BASE = (import.meta.env.VITE_API_URL as string | undefined) || "http://localhost:8000";

const WEIGHT_META: { key: keyof ScoringWeights; label: string; desc: string }[] = [
  {
    key: "dense",
    label: "Semantic Similarity",
    desc: "Deep contextual meaning match between resume and JD (embeddings).",
  },
  {
    key: "bm25",
    label: "Keyword Overlap (BM25)",
    desc: "Classic information-retrieval relevance scoring.",
  },
  { key: "tfidf", label: "TF-IDF Similarity", desc: "Term-frequency weighted text similarity." },
  {
    key: "keyword",
    label: "Skill Keyword Coverage",
    desc: "Share of JD-required skills found in the resume.",
  },
];

function SettingsPage() {
  const [weights, setWeights] = useState<ScoringWeights | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("loading");
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [health, setHealth] = useState<"unknown" | "checking" | "online" | "offline">("unknown");

  useEffect(() => {
    fetchSettings()
      .then((w) => {
        setWeights(w);
        setStatus("idle");
      })
      .catch((e) => {
        setErrorMsg(e instanceof ApiError ? e.message : "Couldn't load settings.");
        setStatus("error");
      });
  }, []);

  const total = weights ? weights.dense + weights.bm25 + weights.tfidf + weights.keyword : 0;

  const updateWeight = (key: keyof ScoringWeights, value: number) => {
    if (!weights) return;
    setWeights({ ...weights, [key]: value / 100 });
  };

  const handleSave = async () => {
    if (!weights) return;
    setSaveState("saving");
    try {
      const saved = await saveSettings(weights);
      setWeights(saved);
      setSaveState("saved");
      setTimeout(() => setSaveState("idle"), 2500);
    } catch (e) {
      setErrorMsg(e instanceof ApiError ? e.message : "Couldn't save settings.");
      setSaveState("error");
      setTimeout(() => setSaveState("idle"), 3000);
    }
  };

  const handleReset = async () => {
    setSaveState("saving");
    try {
      const def = await resetSettings();
      setWeights(def);
      setSaveState("saved");
      setTimeout(() => setSaveState("idle"), 2500);
    } catch (e) {
      setErrorMsg(e instanceof ApiError ? e.message : "Couldn't reset settings.");
      setSaveState("error");
    }
  };

  const checkConnection = async () => {
    setHealth("checking");
    try {
      const res = await fetch(`${API_BASE}/api/health`);
      setHealth(res.ok ? "online" : "offline");
    } catch {
      setHealth("offline");
    }
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-2">
        <div className="font-mono-label text-primary-glow">// model_configuration</div>
        <h1 className="text-4xl md:text-5xl font-bold tracking-tight">
          Engine <span className="text-gradient-primary">Settings</span>
        </h1>
        <p className="text-muted-foreground max-w-2xl">
          Tune how the matching engine weighs each scoring signal. Changes apply to every scan run
          after saving.
        </p>
      </header>

      {status === "loading" ? (
        <div className="glass rounded-xl p-10 flex items-center justify-center gap-3 text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Loading settings…
        </div>
      ) : status === "error" ? (
        <div className="glass rounded-xl border border-destructive/40 bg-destructive/10 p-4 flex items-center gap-3">
          <AlertTriangle className="size-4 text-destructive shrink-0" />
          <div className="text-sm text-muted-foreground">{errorMsg}</div>
        </div>
      ) : weights ? (
        <section className="glass rounded-xl p-6 md:p-8">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-2.5">
              <div className="size-9 rounded-md bg-primary/15 border border-primary/30 grid place-items-center">
                <SlidersHorizontal className="size-4 text-primary-glow" />
              </div>
              <h2 className="font-display font-semibold text-lg">Scoring Weights</h2>
            </div>
            <span
              className={`font-mono-label ${Math.abs(total - 1) < 0.01 ? "text-success" : "text-warning"}`}
            >
              SUM: {(total * 100).toFixed(0)}%
            </span>
          </div>

          <div className="space-y-6">
            {WEIGHT_META.map((m) => (
              <div key={m.key}>
                <div className="flex items-center justify-between mb-1">
                  <div>
                    <div className="text-sm font-medium">{m.label}</div>
                    <div className="text-xs text-muted-foreground">{m.desc}</div>
                  </div>
                  <span className="font-mono text-sm text-primary-glow shrink-0 ml-4">
                    {Math.round(weights[m.key] * 100)}%
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={Math.round(weights[m.key] * 100)}
                  onChange={(e) => updateWeight(m.key, Number(e.target.value))}
                  className="w-full accent-primary"
                />
              </div>
            ))}
          </div>

          <p className="text-xs text-muted-foreground mt-2">
            Weights are automatically normalised to sum to 100% when saved, regardless of the raw
            values above.
          </p>

          <div className="mt-6 pt-5 border-t border-border flex items-center gap-3">
            <button
              onClick={handleSave}
              disabled={saveState === "saving"}
              className="inline-flex items-center gap-2 px-5 h-10 rounded-md bg-gradient-to-r from-primary to-primary-glow text-primary-foreground text-sm font-semibold glow-primary hover:opacity-95 transition disabled:opacity-70"
            >
              {saveState === "saving" ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Save className="size-4" />
              )}
              Save Weights
            </button>
            <button
              onClick={handleReset}
              disabled={saveState === "saving"}
              className="inline-flex items-center gap-2 px-4 h-10 rounded-md border border-border hover:bg-surface-2 text-sm transition"
            >
              <RotateCcw className="size-4" /> Reset to Defaults
            </button>
            {saveState === "saved" && (
              <span className="text-sm text-success flex items-center gap-1.5">
                <CheckCircle2 className="size-4" /> Saved
              </span>
            )}
            {saveState === "error" && <span className="text-sm text-destructive">{errorMsg}</span>}
          </div>
        </section>
      ) : null}

      <section className="glass rounded-xl p-6 md:p-8">
        <div className="flex items-center gap-2.5 mb-4">
          <div className="size-9 rounded-md bg-success/15 border border-success/30 grid place-items-center">
            <Server className="size-4 text-success" />
          </div>
          <h2 className="font-display font-semibold text-lg">Backend Connection</h2>
        </div>
        <div className="flex items-center justify-between rounded-md border border-border bg-surface-2/30 px-4 py-3">
          <div>
            <div className="font-mono text-sm">{API_BASE}</div>
            <div className="text-xs text-muted-foreground mt-0.5">
              RecruitIQ API endpoint (set via VITE_API_URL)
            </div>
          </div>
          <div className="flex items-center gap-3">
            {health === "online" && (
              <span className="text-xs text-success flex items-center gap-1.5">
                <CheckCircle2 className="size-3.5" /> Online
              </span>
            )}
            {health === "offline" && (
              <span className="text-xs text-destructive flex items-center gap-1.5">
                <AlertTriangle className="size-3.5" /> Unreachable
              </span>
            )}
            <button
              onClick={checkConnection}
              disabled={health === "checking"}
              className="inline-flex items-center gap-2 px-3 h-9 rounded-md border border-border hover:bg-surface-2 text-sm transition"
            >
              {health === "checking" ? <Loader2 className="size-3.5 animate-spin" /> : null}
              Test Connection
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
