import { createContext, useContext, useState, type ReactNode } from "react";
import type { ScreeningResult } from "./api";

export type Phase = "upload" | "analyzing" | "results";

interface ScannerState {
  phase: Phase;
  setPhase: (p: Phase) => void;
  file: File | null;
  setFile: (f: File | null) => void;
  jd: string;
  setJd: (s: string) => void;
  progress: number;
  setProgress: (n: number) => void;
  activeStep: number;
  setActiveStep: (n: number) => void;
  result: ScreeningResult | null;
  setResult: (r: ScreeningResult | null) => void;
  error: string | null;
  setError: (e: string | null) => void;
  resetScan: () => void;
}

const ScannerContext = createContext<ScannerState | null>(null);

export function ScannerProvider({ children }: { children: ReactNode }) {
  const [phase, setPhase] = useState<Phase>("upload");
  const [file, setFile] = useState<File | null>(null);
  const [jd, setJd] = useState("");
  const [progress, setProgress] = useState(0);
  const [activeStep, setActiveStep] = useState(0);
  const [result, setResult] = useState<ScreeningResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const resetScan = () => {
    setPhase("upload");
    setResult(null);
    setError(null);
    setFile(null);
    setJd("");
    setProgress(0);
    setActiveStep(0);
  };

  return (
    <ScannerContext.Provider
      value={{
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
        resetScan,
      }}
    >
      {children}
    </ScannerContext.Provider>
  );
}

export function useScanner() {
  const ctx = useContext(ScannerContext);
  if (!ctx) throw new Error("useScanner must be used within a ScannerProvider");
  return ctx;
}

/* ---------------- Export registry ---------------- */
/**
 * Lets whichever page is currently mounted register a CSV export handler
 * for the TopBar's "Export" button, without every page needing to know
 * about the TopBar directly.
 */
interface ExportState {
  exportHandler: (() => void) | null;
  exportLabel: string | null;
  setExportConfig: (handler: (() => void) | null, label?: string | null) => void;
}

const ExportContext = createContext<ExportState | null>(null);

export function ExportProvider({ children }: { children: ReactNode }) {
  const [exportHandler, setExportHandler] = useState<(() => void) | null>(null);
  const [exportLabel, setExportLabel] = useState<string | null>(null);

  const setExportConfig = (handler: (() => void) | null, label: string | null = null) => {
    // IMPORTANT: React useState treats any function passed to a setter as a state-updater
    // and calls it immediately to derive the new state. To store a function as state,
    // we must wrap it in another arrow so React sees a "producer" that returns our handler.
    setExportHandler(handler !== null ? () => handler : null);
    setExportLabel(label);
  };

  return (
    <ExportContext.Provider value={{ exportHandler, exportLabel, setExportConfig }}>
      {children}
    </ExportContext.Provider>
  );
}

export function useExport() {
  const ctx = useContext(ExportContext);
  if (!ctx) throw new Error("useExport must be used within an ExportProvider");
  return ctx;
}
