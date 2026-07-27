import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import {
  Database,
  Download,
  GitCompareArrows,
  Moon,
  Radar,
  Sparkles,
  Sun,
  Target,
} from "lucide-react";
import { useExport, useScanner } from "@/lib/scanner-context";

export function ThemeToggle() {
  const [theme, setTheme] = useState<"dark" | "light">(() => {
    if (typeof window === "undefined") return "dark";
    return (localStorage.getItem("theme") as "dark" | "light") || "dark";
  });
  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("light", theme === "light");
    root.classList.toggle("dark", theme === "dark");
    localStorage.setItem("theme", theme);
  }, [theme]);
  return (
    <button
      onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
      className="size-9 grid place-items-center rounded-md border border-border hover:bg-surface-2 transition"
      aria-label="Toggle theme"
    >
      {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
    </button>
  );
}

const NAV = [
  { to: "/", icon: Target, label: "Scanner" },
  { to: "/compare", icon: GitCompareArrows, label: "Match Lab" },
  { to: "/skills-db", icon: Database, label: "Skills DB" },
] as const;

export function Sidebar() {
  const { resetScan } = useScanner();
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <aside className="workspace-sidebar hidden md:flex flex-col w-[220px] shrink-0 border-r border-border bg-surface/40 backdrop-blur-xl">
      <div className="px-5 pt-5 pb-6">
        <div className="flex items-center gap-2.5">
          <div className="size-8 rounded-lg bg-gradient-to-br from-primary to-primary-glow grid place-items-center glow-primary">
            <Radar className="size-4 text-primary-foreground" />
          </div>
          <div>
            <div className="font-display font-bold text-base leading-none">NeuralRecruit</div>
            <div className="font-mono-label text-muted-foreground mt-1.5">
              PRECISION · HR · v2.1
            </div>
          </div>
        </div>
      </div>

      <nav className="px-2.5 flex-1 space-y-1">
        {NAV.map((n) => {
          const active = location.pathname === n.to;
          return (
            <Link
              key={n.label}
              to={n.to}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition ${
                active
                  ? "bg-primary/15 text-foreground border-l-2 border-primary"
                  : "text-muted-foreground hover:text-foreground hover:bg-surface-2/50 border-l-2 border-transparent"
              }`}
            >
              <n.icon className="size-4" />
              <span className="font-medium">{n.label}</span>
              {active && (
                <span className="ml-auto size-1.5 rounded-full bg-success animate-pulse" />
              )}
            </Link>
          );
        })}
      </nav>

      <div className="px-3 pb-3 space-y-2.5">
        <button
          onClick={() => {
            resetScan();
            navigate({ to: "/" });
          }}
          className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-md bg-gradient-to-br from-primary to-primary-glow text-primary-foreground text-sm font-semibold hover:opacity-95 transition glow-primary"
        >
          <Sparkles className="size-4" /> New Scan
        </button>
        <div className="rounded-lg border border-success/20 bg-success/5 px-3 py-2.5">
          <div className="font-mono-label text-success">HR SHOWCASE</div>
          <div className="mt-1 text-[11px] text-muted-foreground">
            No account or sign-in required
          </div>
        </div>
      </div>
    </aside>
  );
}

const ROUTE_LABELS: Record<string, string> = {
  "/compare": "MATCH_LAB",
  "/skills-db": "SKILLS_DB",
};

export function TopBar() {
  const { phase } = useScanner();
  const { exportHandler, exportLabel } = useExport();
  const location = useLocation();

  const scannerLabel =
    phase === "upload" ? "SCAN_CENTER" : phase === "analyzing" ? "ANALYSIS_ACTIVE" : "REPORT_READY";
  const label =
    location.pathname === "/" ? scannerLabel : (ROUTE_LABELS[location.pathname] ?? "READY");

  return (
    <header className="border-b border-border bg-surface/30 backdrop-blur-xl">
      <div className="workspace-topbar-frame px-6 md:px-10 lg:px-8 max-w-[1360px] mx-auto h-16 lg:h-14 flex items-center gap-6 lg:gap-5">
        <div className="flex items-center gap-2.5">
          <span
            className={`size-2 rounded-full ${phase === "analyzing" && location.pathname === "/" ? "bg-primary animate-pulse" : "bg-success"}`}
          />
          <span className="font-mono-label text-muted-foreground">SYSTEM_STATUS:</span>
          <span className="font-mono-label text-foreground">{label}</span>
        </div>
        <div className="ml-auto flex items-center gap-3">
          <ThemeToggle />
          {exportHandler && (
            <button
              onClick={exportHandler}
              title={`Export ${exportLabel ?? "data"} as CSV`}
              className="hidden sm:flex items-center gap-2 px-3 h-9 rounded-md border border-border text-sm transition hover:bg-surface-2"
            >
              <Download className="size-4" /> Export
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
