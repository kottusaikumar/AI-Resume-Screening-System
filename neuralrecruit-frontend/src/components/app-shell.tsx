import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import {
  Activity,
  Bell,
  Database,
  Download,
  History,
  Home,
  LogOut,
  Moon,
  Radar,
  Settings,
  Sparkles,
  Sun,
  Target,
  UserRound,
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
  { to: "/history", icon: History, label: "History" },
  { to: "/skills-db", icon: Database, label: "Skills DB" },
  { to: "/analytics", icon: Activity, label: "Analytics" },
  { to: "/settings", icon: Settings, label: "Settings" },
] as const;

export function Sidebar() {
  const { resetScan } = useScanner();
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <aside className="hidden md:flex flex-col w-[260px] shrink-0 border-r border-border bg-surface/40 backdrop-blur-xl">
      <div className="px-6 pt-7 pb-8">
        <div className="flex items-center gap-2.5">
          <div className="size-9 rounded-lg bg-gradient-to-br from-primary to-primary-glow grid place-items-center glow-primary">
            <Radar className="size-5 text-primary-foreground" />
          </div>
          <div>
            <div className="font-display font-bold text-lg leading-none">NeuralRecruit</div>
            <div className="font-mono-label text-muted-foreground mt-1.5">
              PRECISION · HR · v2.1
            </div>
          </div>
        </div>
      </div>

      <nav className="px-3 flex-1 space-y-1">
        {NAV.map((n) => {
          const active = location.pathname === n.to;
          return (
            <Link
              key={n.label}
              to={n.to}
              className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-md text-sm transition ${active
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

      <div className="px-4 pb-4 space-y-3">
        <button
          onClick={() => {
            resetScan();
            navigate({ to: "/" });
          }}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-md bg-gradient-to-br from-primary to-primary-glow text-primary-foreground text-sm font-semibold hover:opacity-95 transition glow-primary"
        >
          <Sparkles className="size-4" /> New Scan
        </button>
        <div className="rounded-lg border border-border bg-surface-2/40 p-3">
          <div className="flex items-center gap-2.5">
            <div className="size-8 rounded-md bg-gradient-to-br from-success to-primary-glow grid place-items-center">
              <UserRound className="size-4 text-background" />
            </div>
            <div className="min-w-0">
              <div className="text-sm font-medium truncate">Alex Thorne</div>
              <div className="text-[11px] text-muted-foreground truncate">Senior Recruiter</div>
            </div>
            <LogOut className="size-4 text-muted-foreground ml-auto" />
          </div>
        </div>
      </div>
    </aside>
  );
}

const ROUTE_LABELS: Record<string, string> = {
  "/history": "HISTORY",
  "/skills-db": "SKILLS_DB",
  "/analytics": "ANALYTICS",
  "/settings": "SETTINGS",
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
      <div className="px-6 md:px-10 lg:px-12 max-w-[1480px] mx-auto h-16 flex items-center gap-6">
        <div className="flex items-center gap-2.5">
          <span
            className={`size-2 rounded-full ${phase === "analyzing" && location.pathname === "/" ? "bg-primary animate-pulse" : "bg-success"}`}
          />
          <span className="font-mono-label text-muted-foreground">SYSTEM_STATUS:</span>
          <span className="font-mono-label text-foreground">{label}</span>
        </div>
        <nav className="ml-6 hidden lg:flex items-center gap-6 text-sm text-muted-foreground">
          {[
            { to: "/analytics" as const, icon: Home, label: "Dashboard" },
            { to: "/" as const, icon: Target, label: "Scanner" },
            { to: "/history" as const, icon: Activity, label: "Reports" },
          ].map((item) => {
            const itemActive = location.pathname === item.to;
            return (
              <Link
                key={item.label}
                to={item.to}
                className={`flex items-center gap-1.5 transition ${itemActive
                    ? "text-foreground border-b border-primary pb-0.5"
                    : "hover:text-foreground"
                  }`}
              >
                <item.icon className="size-3.5" /> {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="ml-auto flex items-center gap-3">
          <button
            className="size-9 grid place-items-center rounded-md border border-border hover:bg-surface-2 transition"
            aria-label="Notifications"
            title="No new notifications"
          >
            <Bell className="size-4" />
          </button>
          <ThemeToggle />
          <button
            onClick={() => exportHandler?.()}
            disabled={!exportHandler}
            title={
              exportHandler
                ? `Export ${exportLabel ?? "data"} as CSV`
                : "Nothing to export on this page yet"
            }
            className={`hidden sm:flex items-center gap-2 px-3 h-9 rounded-md border text-sm transition ${exportHandler
                ? "border-border hover:bg-surface-2"
                : "border-border/50 text-muted-foreground/50 cursor-not-allowed"
              }`}
          >
            <Download className="size-4" /> Export
          </button>
        </div>
      </div>
    </header>
  );
}
