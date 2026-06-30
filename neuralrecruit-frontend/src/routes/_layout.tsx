import { createFileRoute, Outlet } from "@tanstack/react-router";
import { Sidebar, TopBar } from "@/components/app-shell";
import { ScannerProvider, ExportProvider } from "@/lib/scanner-context";

export const Route = createFileRoute("/_layout")({
  component: LayoutComponent,
});

function LayoutComponent() {
  return (
    <ScannerProvider>
      <ExportProvider>
        <div className="min-h-screen flex">
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
