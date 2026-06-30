import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AlertTriangle, ArrowLeft, History as HistoryIcon, Loader2, Trash2 } from "lucide-react";
import {
  clearHistory,
  deleteHistoryItem,
  fetchHistory,
  fetchHistoryItem,
  ApiError,
  type HistoryItem,
  type ScreeningResult,
} from "@/lib/api";
import { useExport } from "@/lib/scanner-context";
import { downloadCsv } from "@/lib/csv";
import { ResultsView } from "./_layout.index";

export const Route = createFileRoute("/_layout/history")({
  head: () => ({ meta: [{ title: "Scan History — NeuralRecruit" }] }),
  component: HistoryPage,
});

function matchColor(label: string) {
  if (label === "Exceptional Match" || label === "Strong Match") return "text-success";
  if (label === "Partial Match") return "text-warning";
  return "text-destructive";
}

function HistoryPage() {
  const { setExportConfig } = useExport();
  const [items, setItems] = useState<HistoryItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<ScreeningResult | null>(null);
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);

  const load = () => {
    setError(null);
    fetchHistory(50)
      .then(setItems)
      .catch((e) => setError(e instanceof ApiError ? e.message : "Couldn't load scan history."));
  };

  useEffect(load, []);

  useEffect(() => {
    if (selected) {
      setExportConfig(null);
      return;
    }
    if (items && items.length > 0) {
      setExportConfig(() => {
        downloadCsv("scan-history.csv", [
          [
            "Report ID",
            "Date",
            "Resume File",
            "Match %",
            "Match Label",
            "Retention Risk",
            "Seniority",
            "Years Exp",
          ],
          ...items.map((i) => [
            i.report_id,
            i.created_at,
            i.resume_filename,
            i.match_percentage,
            i.match_label,
            i.retention_risk,
            i.seniority_level,
            i.estimated_years,
          ]),
        ]);
      }, "history");
    } else {
      setExportConfig(null);
    }
    return () => setExportConfig(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, selected]);

  const openReport = async (reportId: string, filename: string) => {
    setLoadingId(reportId);
    try {
      const data = await fetchHistoryItem(reportId);
      setSelected(data);
      setSelectedFileName(filename);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't load that report.");
    } finally {
      setLoadingId(null);
    }
  };

  const handleDelete = async (reportId: string) => {
    try {
      await deleteHistoryItem(reportId);
      setItems((prev) => prev?.filter((i) => i.report_id !== reportId) ?? null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't delete that report.");
    }
  };

  const handleClearAll = async () => {
    try {
      await clearHistory();
      setItems([]);
      setConfirmClear(false);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't clear history.");
    }
  };

  if (selected) {
    return (
      <div className="space-y-6">
        <button
          onClick={() => {
            setSelected(null);
            setSelectedFileName(null);
          }}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition"
        >
          <ArrowLeft className="size-4" /> Back to history
        </button>
        <ResultsView result={selected} fileName={selectedFileName} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
        <div>
          <div className="font-mono-label text-primary-glow">// scan_history</div>
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight mt-1">
            Scan <span className="text-gradient-primary">History</span>
          </h1>
          <p className="text-muted-foreground mt-2 max-w-2xl">
            Every candidate scan run on this machine, stored locally for quick recall.
          </p>
        </div>
        {items && items.length > 0 && (
          <div className="flex items-center gap-2">
            {confirmClear ? (
              <>
                <span className="text-sm text-muted-foreground">Delete all history?</span>
                <button
                  onClick={handleClearAll}
                  className="px-3 h-9 rounded-md bg-destructive text-destructive-foreground text-sm font-semibold"
                >
                  Yes, clear all
                </button>
                <button
                  onClick={() => setConfirmClear(false)}
                  className="px-3 h-9 rounded-md border border-border text-sm"
                >
                  Cancel
                </button>
              </>
            ) : (
              <button
                onClick={() => setConfirmClear(true)}
                className="inline-flex items-center gap-2 px-3 h-9 rounded-md border border-border hover:bg-surface-2 text-sm transition"
              >
                <Trash2 className="size-4" /> Clear History
              </button>
            )}
          </div>
        )}
      </header>

      {error && (
        <div className="glass rounded-xl border border-destructive/40 bg-destructive/10 p-4 flex items-center gap-3">
          <AlertTriangle className="size-4 text-destructive shrink-0" />
          <div className="text-sm text-muted-foreground">{error}</div>
        </div>
      )}

      {items === null ? (
        <div className="glass rounded-xl p-10 flex items-center justify-center gap-3 text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Loading scan history…
        </div>
      ) : items.length === 0 ? (
        <div className="glass rounded-xl p-12 flex flex-col items-center text-center gap-3">
          <div className="size-14 rounded-2xl bg-surface-2/60 border border-border grid place-items-center">
            <HistoryIcon className="size-6 text-muted-foreground" />
          </div>
          <div className="font-display font-semibold text-lg">No scans yet</div>
          <p className="text-sm text-muted-foreground max-w-sm">
            Run your first candidate scan from the Scanner page to see it appear here.
          </p>
        </div>
      ) : (
        <div className="glass rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-surface-2/40 text-left">
              <tr className="font-mono-label text-muted-foreground">
                <th className="px-5 py-3">Resume</th>
                <th className="px-5 py-3">Date</th>
                <th className="px-5 py-3">Match</th>
                <th className="px-5 py-3">Retention</th>
                <th className="px-5 py-3">Seniority</th>
                <th className="px-5 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr
                  key={item.report_id}
                  className="border-t border-border hover:bg-surface-2/30 transition"
                >
                  <td className="px-5 py-3.5 font-mono text-xs truncate max-w-[220px]">
                    {item.resume_filename}
                  </td>
                  <td className="px-5 py-3.5 text-muted-foreground text-xs">
                    {new Date(item.created_at).toLocaleString()}
                  </td>
                  <td className="px-5 py-3.5">
                    <span className={`font-semibold ${matchColor(item.match_label)}`}>
                      {Math.round(item.match_percentage)}%
                    </span>
                    <span className="text-muted-foreground text-xs ml-1.5">{item.match_label}</span>
                  </td>
                  <td className="px-5 py-3.5 text-xs">{item.retention_risk}</td>
                  <td className="px-5 py-3.5 text-xs">{item.seniority_level}</td>
                  <td className="px-5 py-3.5 text-right whitespace-nowrap">
                    <button
                      onClick={() => openReport(item.report_id, item.resume_filename)}
                      disabled={loadingId === item.report_id}
                      className="text-xs font-medium text-primary-glow hover:underline mr-4 disabled:opacity-60"
                    >
                      {loadingId === item.report_id ? "Loading…" : "View Report"}
                    </button>
                    <button
                      onClick={() => handleDelete(item.report_id)}
                      className="text-muted-foreground hover:text-destructive transition"
                      aria-label="Delete"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
