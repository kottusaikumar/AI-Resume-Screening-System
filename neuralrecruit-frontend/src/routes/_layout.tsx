import { createFileRoute, Outlet } from "@tanstack/react-router";
import { Sidebar, TopBar } from "@/components/app-shell";
import { ScannerProvider, ExportProvider } from "@/lib/scanner-context";
import { useAuth } from "@/lib/auth-context";
import { ShowcaseLanding } from "@/components/showcase-landing";
import { useState } from "react";

export const Route = createFileRoute("/_layout")({
  component: LayoutComponent,
});

function LayoutComponent() {
  const { user, loading, error, ensureAccess } = useAuth();
  const [showWorkspace, setShowWorkspace] = useState(false);
  const enterWorkspace = async () => {
    const ready = await ensureAccess();
    if (ready) setShowWorkspace(true);
  };

  if (!showWorkspace) {
    return (
      <>
        <ShowcaseLanding onEnter={() => void enterWorkspace()} entering={loading} />
        {error && (
          <div className="landing-entry-error" role="alert">
            <strong>Workspace unavailable</strong>
            <span>{error}</span>
            <button type="button" onClick={() => void enterWorkspace()}>
              Try again
            </button>
          </div>
        )}
      </>
    );
  }
  if (loading) {
    return (
      <div className="landing-session-loader">
        <span className="landing-brand-mark">
          <span className="landing-loader-ring" />
        </span>
        <strong>NeuralRecruit</strong>
        <small>Preparing the HR showcase…</small>
      </div>
    );
  }
  if (!user) {
    return (
      <div className="min-h-screen grid place-items-center bg-background px-5">
        <div className="glass max-w-md rounded-xl p-8 text-center">
          <strong className="font-display text-xl">Showcase unavailable</strong>
          <p className="mt-2 text-sm text-muted-foreground">
            {error ?? "The workspace could not be prepared."}
          </p>
          <button
            type="button"
            onClick={() => void enterWorkspace()}
            className="mt-5 rounded-md bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  return (
    <ScannerProvider>
      <ExportProvider>
        <div className="app-workspace min-h-screen flex">
          <Sidebar />
          <main className="flex-1 min-w-0">
            <TopBar />
            <div className="px-6 md:px-10 lg:px-12 py-8 max-w-[1480px] mx-auto">
              <Outlet />
            </div>
          </main>
        </div>
      </ExportProvider>
    </ScannerProvider>
  );
}
