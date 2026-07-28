import { createFileRoute, Outlet } from "@tanstack/react-router";
import { Sidebar, TopBar } from "@/components/app-shell";
import { ScannerProvider, ExportProvider } from "@/lib/scanner-context";
import { ShowcaseLanding } from "@/components/showcase-landing";
import { AuthProvider } from "@/lib/auth-context";
import { useState } from "react";

export const Route = createFileRoute("/_layout")({
  component: LayoutComponent,
});

function LayoutComponent() {
  const [showWorkspace, setShowWorkspace] = useState(false);

  if (!showWorkspace) {
    return <ShowcaseLanding onEnter={() => setShowWorkspace(true)} />;
  }

  return (
    <AuthProvider>
      <ScannerProvider>
        <ExportProvider>
          <div className="app-workspace min-h-screen flex">
            <Sidebar />
            <main className="flex-1 min-w-0">
              <TopBar />
              <div className="workspace-content px-6 md:px-10 lg:px-8 py-8 lg:py-6 max-w-[1360px] mx-auto">
                <Outlet />
              </div>
            </main>
          </div>
        </ExportProvider>
      </ScannerProvider>
    </AuthProvider>
  );
}
