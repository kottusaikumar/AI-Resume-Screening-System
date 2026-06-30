import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AlertTriangle, BarChart3, Loader2, TrendingUp, Users } from "lucide-react";
import { fetchAnalytics, ApiError, type Analytics } from "@/lib/api";
import { useExport } from "@/lib/scanner-context";
import { downloadCsv } from "@/lib/csv";

export const Route = createFileRoute("/_layout/analytics")({
  head: () => ({ meta: [{ title: "Analytics — NeuralRecruit" }] }),
  component: AnalyticsPage,
});

const LABEL_TONE: Record<string, string> = {
  "Exceptional Match": "bg-success",
  "Strong Match": "bg-success",
  "Partial Match": "bg-warning",
  "Limited Match": "bg-destructive",
};

const RISK_TONE: Record<string, string> = {
  Low: "bg-success",
  Medium: "bg-warning",
  High: "bg-destructive",
};

function DistributionBar({
  entries,
  toneMap,
}: {
  entries: [string, number][];
  toneMap: Record<string, string>;
}) {
  const total = entries.reduce((sum, [, v]) => sum + v, 0) || 1;
  return (
    <div className="space-y-3">
      {entries.map(([label, count]) => (
        <div key={label}>
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="text-foreground/90">{label}</span>
            <span className="text-muted-foreground font-mono">{count}</span>
          </div>
          <div className="h-2 rounded-full bg-surface-3 overflow-hidden">
            <div
              className={`h-full rounded-full ${toneMap[label] ?? "bg-primary"}`}
              style={{ width: `${(count / total) * 100}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function AnalyticsPage() {
  const { setExportConfig } = useExport();
  const [data, setData] = useState<Analytics | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchAnalytics()
      .then(setData)
      .catch((e) => setError(e instanceof ApiError ? e.message : "Couldn't load analytics."));
  }, []);

  useEffect(() => {
    if (!data || data.total_scans === 0) {
      setExportConfig(null);
      return;
    }
    setExportConfig(() => {
      downloadCsv("analytics-summary.csv", [
        ["Metric", "Value"],
        ["Total Scans", data.total_scans],
        ["Avg Match %", data.avg_match_percentage],
        ["Avg Years Experience", data.avg_years_experience],
        [],
        ["Match Label", "Count"],
        ...Object.entries(data.match_label_distribution),
        [],
        ["Top Missing Skill", "Count"],
        ...data.top_missing_skills.map((s) => [s.skill, s.count]),
      ]);
    }, "analytics summary");
    return () => setExportConfig(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-2">
        <div className="font-mono-label text-primary-glow">// recruiting_analytics</div>
        <h1 className="text-4xl md:text-5xl font-bold tracking-tight">
          Recruiting <span className="text-gradient-primary">Analytics</span>
        </h1>
        <p className="text-muted-foreground max-w-2xl">
          Aggregate trends across every scan run on this machine.
        </p>
      </header>

      {error && (
        <div className="glass rounded-xl border border-destructive/40 bg-destructive/10 p-4 flex items-center gap-3">
          <AlertTriangle className="size-4 text-destructive shrink-0" />
          <div className="text-sm text-muted-foreground">{error}</div>
        </div>
      )}

      {!data && !error ? (
        <div className="glass rounded-xl p-10 flex items-center justify-center gap-3 text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Crunching the numbers…
        </div>
      ) : data && data.total_scans === 0 ? (
        <div className="glass rounded-xl p-12 flex flex-col items-center text-center gap-3">
          <div className="size-14 rounded-2xl bg-surface-2/60 border border-border grid place-items-center">
            <BarChart3 className="size-6 text-muted-foreground" />
          </div>
          <div className="font-display font-semibold text-lg">No data yet</div>
          <p className="text-sm text-muted-foreground max-w-sm">
            Analytics will populate automatically as you run scans from the Scanner page.
          </p>
        </div>
      ) : data ? (
        <>
          <div className="grid md:grid-cols-3 gap-4">
            <section className="glass rounded-xl p-6">
              <div className="flex items-center gap-2.5 mb-3">
                <div className="size-9 rounded-md bg-primary/15 border border-primary/30 grid place-items-center">
                  <Users className="size-4 text-primary-glow" />
                </div>
                <span className="font-mono-label text-muted-foreground">TOTAL SCANS</span>
              </div>
              <div className="font-display text-3xl font-bold">{data.total_scans}</div>
            </section>
            <section className="glass rounded-xl p-6">
              <div className="flex items-center gap-2.5 mb-3">
                <div className="size-9 rounded-md bg-success/15 border border-success/30 grid place-items-center">
                  <TrendingUp className="size-4 text-success" />
                </div>
                <span className="font-mono-label text-muted-foreground">AVG MATCH SCORE</span>
              </div>
              <div className="font-display text-3xl font-bold">
                {data.avg_match_percentage.toFixed(0)}%
              </div>
            </section>
            <section className="glass rounded-xl p-6">
              <div className="flex items-center gap-2.5 mb-3">
                <div className="size-9 rounded-md bg-warning/15 border border-warning/30 grid place-items-center">
                  <BarChart3 className="size-4 text-warning" />
                </div>
                <span className="font-mono-label text-muted-foreground">AVG YEARS EXPERIENCE</span>
              </div>
              <div className="font-display text-3xl font-bold">
                {data.avg_years_experience.toFixed(1)}
              </div>
            </section>
          </div>

          <div className="grid lg:grid-cols-2 gap-6">
            <section className="glass rounded-xl p-6">
              <h3 className="font-display font-semibold mb-4">Match Label Distribution</h3>
              <DistributionBar
                entries={Object.entries(data.match_label_distribution)}
                toneMap={LABEL_TONE}
              />
            </section>
            <section className="glass rounded-xl p-6">
              <h3 className="font-display font-semibold mb-4">Retention Risk Distribution</h3>
              <DistributionBar
                entries={Object.entries(data.retention_risk_distribution)}
                toneMap={RISK_TONE}
              />
            </section>
          </div>

          <section className="glass rounded-xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-display font-semibold">Most Common Skill Gaps</h3>
              <span className="font-mono-label text-muted-foreground">ACROSS ALL SCANS</span>
            </div>
            {data.top_missing_skills.length === 0 ? (
              <p className="text-sm text-muted-foreground">No skill gaps recorded yet.</p>
            ) : (
              <div className="space-y-3">
                {data.top_missing_skills.map((s) => (
                  <div key={s.skill}>
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="text-foreground/90 font-mono">{s.skill}</span>
                      <span className="text-muted-foreground">{s.count}</span>
                    </div>
                    <div className="h-2 rounded-full bg-surface-3 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-warning to-destructive"
                        style={{ width: `${(s.count / data.top_missing_skills[0].count) * 100}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      ) : null}
    </div>
  );
}
