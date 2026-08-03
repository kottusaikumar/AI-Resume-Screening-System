import { useEffect, useMemo, useRef, useState } from "react";
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Eye,
  FileWarning,
  Layers3,
  LoaderCircle,
  Minus,
  MousePointerClick,
  Plus,
  ShieldCheck,
} from "lucide-react";
import type {
  PDFDocumentLoadingTask,
  PDFDocumentProxy,
  PDFPageProxy,
  TextItem,
} from "pdfjs-dist/types/src/display/api";
import {
  classifyResumeEvidenceLine,
  detectResumeSection,
  type AnnotationTone,
  type EvidenceConfidence,
  type ResumeSection,
} from "@/lib/resume-evidence";

interface ResumeAnnotation {
  id: string;
  page: number;
  left: number;
  top: number;
  width: number;
  height: number;
  text: string;
  tone: AnnotationTone;
  section: ResumeSection;
  confidence: EvidenceConfidence;
  title: string;
  detail: string;
  recommendation: string;
}

interface PageAnnotations {
  page: number;
  width: number;
  height: number;
  annotations: ResumeAnnotation[];
}

interface TextLine {
  baseline: number;
  left: number;
  right: number;
  top: number;
  bottom: number;
  parts: Array<{ x: number; text: string }>;
}

interface DocxBlock {
  id: string;
  text: string;
  kind: "heading" | "paragraph" | "list" | "table";
  annotation: ResumeAnnotation | null;
}

const MAX_PREVIEW_PAGES = 3;
const PDF_SCALE = 1.35;

function buildPageAnnotations(page: PDFPageProxy, pageNumber: number, scale: number) {
  return page.getTextContent().then((content) => {
    const viewport = page.getViewport({ scale });
    const lines: TextLine[] = [];

    for (const item of content.items) {
      if (!("str" in item)) continue;
      const textItem = item as TextItem;
      const text = textItem.str.trim();
      if (!text) continue;

      const [x, baseline] = viewport.convertToViewportPoint(
        textItem.transform[4],
        textItem.transform[5],
      );
      const fontHeight = Math.max(7, Math.abs(textItem.transform[3]) * scale);
      const width = Math.max(2, textItem.width * scale);
      let line = lines.find((candidate) => Math.abs(candidate.baseline - baseline) <= 3.5);
      if (!line) {
        line = {
          baseline,
          left: x,
          right: x + width,
          top: baseline - fontHeight,
          bottom: baseline + fontHeight * 0.2,
          parts: [],
        };
        lines.push(line);
      }
      line.left = Math.min(line.left, x);
      line.right = Math.max(line.right, x + width);
      line.top = Math.min(line.top, baseline - fontHeight);
      line.bottom = Math.max(line.bottom, baseline + fontHeight * 0.2);
      line.parts.push({ x, text });
    }

    lines.sort((a, b) => a.top - b.top || a.left - b.left);
    let activeSection: ResumeSection = "unknown";

    const annotations = lines.flatMap((line, index) => {
      const text = line.parts
        .sort((a, b) => a.x - b.x)
        .map((part) => part.text)
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();
      const detectedSection = detectResumeSection(text);
      if (detectedSection) {
        activeSection = detectedSection;
        return [];
      }

      const classification = classifyResumeEvidenceLine(text, activeSection);
      if (!classification) return [];

      return [
        {
          id: `resume-annotation-${pageNumber}-${index}`,
          page: pageNumber,
          left: (line.left / viewport.width) * 100,
          top: (line.top / viewport.height) * 100,
          width: ((line.right - line.left) / viewport.width) * 100,
          height: ((line.bottom - line.top) / viewport.height) * 100,
          text,
          section: activeSection,
          ...classification,
        },
      ];
    });

    return {
      page: pageNumber,
      width: viewport.width,
      height: viewport.height,
      annotations,
    } satisfies PageAnnotations;
  });
}

function PdfPagePreview({
  pdf,
  pageModel,
  selectedId,
  onSelect,
  zoom,
}: {
  pdf: PDFDocumentProxy;
  pageModel: PageAnnotations;
  selectedId: string | null;
  onSelect: (annotation: ResumeAnnotation) => void;
  zoom: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    let cancelled = false;
    let page: PDFPageProxy | null = null;
    let renderTask: ReturnType<PDFPageProxy["render"]> | null = null;

    void pdf.getPage(pageModel.page).then((loadedPage) => {
      page = loadedPage;
      const canvas = canvasRef.current;
      if (!canvas || cancelled) return;
      const viewport = loadedPage.getViewport({ scale: PDF_SCALE });
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const context = canvas.getContext("2d", { alpha: false });
      if (!context) return;
      renderTask = loadedPage.render({ canvas, canvasContext: context, viewport });
      return renderTask.promise;
    });

    return () => {
      cancelled = true;
      renderTask?.cancel();
      page?.cleanup();
    };
  }, [pdf, pageModel.page]);

  return (
    <div
      className="mx-auto shrink-0 transition-[width] duration-200"
      style={{
        width: pageModel.width * zoom,
        maxWidth: zoom <= 0.86 ? "100%" : "none",
      }}
    >
      <div
        className="relative overflow-hidden rounded-sm bg-white shadow-[0_22px_60px_-30px_rgba(0,0,0,0.9)]"
        style={{ aspectRatio: `${pageModel.width} / ${pageModel.height}` }}
      >
        <canvas
          ref={canvasRef}
          className="block size-full"
          aria-label={`Resume page ${pageModel.page}`}
        />
        {pageModel.annotations.map((annotation) => {
          const selected = selectedId === annotation.id;
          const tone =
            annotation.tone === "critical"
              ? "border-red-500/80 bg-red-500/25 hover:bg-red-500/35"
              : annotation.tone === "review"
                ? "border-amber-400/80 bg-amber-300/25 hover:bg-amber-300/35"
                : annotation.tone === "neutral"
                  ? "border-sky-400/75 bg-sky-300/20 hover:bg-sky-300/30"
                  : "border-emerald-500/70 bg-emerald-400/20 hover:bg-emerald-400/30";
          return (
            <button
              id={annotation.id}
              key={annotation.id}
              type="button"
              aria-label={`${annotation.title}: ${annotation.text}`}
              title={`${annotation.title} - click for details`}
              onClick={() => onSelect(annotation)}
              className={`absolute rounded-[2px] border-b transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 ${tone} ${
                selected ? "z-10 ring-2 ring-sky-500 ring-offset-1" : ""
              }`}
              style={{
                left: `${annotation.left}%`,
                top: `${annotation.top}%`,
                width: `${Math.max(annotation.width, 1)}%`,
                height: `${Math.max(annotation.height, 1.1)}%`,
              }}
            />
          );
        })}
        <div className="pointer-events-none absolute right-3 top-3 rounded-full bg-black/70 px-2.5 py-1 font-mono text-[9px] text-white">
          PAGE {pageModel.page}
        </div>
      </div>
    </div>
  );
}

async function buildDocxBlocks(file: File) {
  const mammothModule = await import("mammoth");
  const result = await mammothModule.default.convertToHtml(
    { arrayBuffer: await file.arrayBuffer() },
    {
      includeDefaultStyleMap: true,
      styleMap: [
        "p[style-name='Title'] => h1:fresh",
        "p[style-name='Subtitle'] => p.docx-subtitle:fresh",
        "p[style-name='Heading 1'] => h2:fresh",
        "p[style-name='Heading 2'] => h3:fresh",
      ],
    },
  );
  const documentModel = new DOMParser().parseFromString(result.value, "text/html");
  const candidates = Array.from(documentModel.body.querySelectorAll("h1,h2,h3,h4,h5,h6,p,li,tr"));
  let activeSection: ResumeSection = "unknown";

  return candidates.flatMap((element, index): DocxBlock[] => {
    const tag = element.tagName.toLowerCase();
    if (tag === "p" && (element.closest("li") || element.closest("td") || element.closest("th"))) {
      return [];
    }
    if (tag === "li" && element.parentElement?.closest("td,th")) return [];

    const text =
      tag === "tr"
        ? Array.from(element.querySelectorAll(":scope > th, :scope > td"))
            .map((cell) => cell.textContent?.replace(/\s+/g, " ").trim())
            .filter(Boolean)
            .join(" | ")
        : (element.textContent?.replace(/\s+/g, " ").trim() ?? "");
    if (!text) return [];

    const detectedSection = detectResumeSection(text);
    if (detectedSection) activeSection = detectedSection;
    const classificationText = tag === "li" ? `• ${text}` : text;
    const classification = detectedSection
      ? null
      : classifyResumeEvidenceLine(classificationText, activeSection);
    const blockId = `docx-block-${index}`;
    const annotation: ResumeAnnotation | null = classification
      ? {
          id: blockId,
          page: 1,
          left: 0,
          top: 0,
          width: 100,
          height: 0,
          text: classificationText,
          section: activeSection,
          ...classification,
        }
      : null;

    return [
      {
        id: blockId,
        text,
        kind: /^h[1-6]$/.test(tag)
          ? "heading"
          : tag === "li"
            ? "list"
            : tag === "tr"
              ? "table"
              : "paragraph",
        annotation,
      },
    ];
  });
}

function DocxPreview({
  blocks,
  visibleAnnotationIds,
  selectedId,
  onSelect,
}: {
  blocks: DocxBlock[];
  visibleAnnotationIds: Set<string>;
  selectedId: string | null;
  onSelect: (annotation: ResumeAnnotation) => void;
}) {
  return (
    <article className="mx-auto w-full max-w-[820px] rounded-sm bg-white px-8 py-10 text-slate-900 shadow-[0_22px_60px_-30px_rgba(0,0,0,0.9)] sm:px-12">
      {blocks.map((block) => {
        const annotation = block.annotation;
        const visible = annotation ? visibleAnnotationIds.has(annotation.id) : false;
        const selected = annotation?.id === selectedId;
        const tone =
          annotation?.tone === "critical"
            ? "border-red-500 bg-red-100/85"
            : annotation?.tone === "review"
              ? "border-amber-500 bg-amber-100/90"
              : annotation?.tone === "neutral"
                ? "border-sky-500 bg-sky-100/85"
                : "border-emerald-500 bg-emerald-100/85";
        const typography =
          block.kind === "heading"
            ? "mt-5 border-b border-slate-300 pb-1 text-base font-bold uppercase tracking-wide first:mt-0"
            : block.kind === "list"
              ? "ml-5 text-[13px] leading-6"
              : block.kind === "table"
                ? "border-b border-slate-200 py-1 font-mono text-[11px] leading-5"
                : "text-[13px] leading-6";

        if (!annotation || !visible) {
          return (
            <div key={block.id} className={typography}>
              {block.kind === "list" ? `• ${block.text}` : block.text}
            </div>
          );
        }

        return (
          <button
            id={annotation.id}
            key={block.id}
            type="button"
            onClick={() => onSelect(annotation)}
            aria-label={`${annotation.title}: ${annotation.text}`}
            className={`my-0.5 block w-full rounded-sm border-l-2 px-2 text-left transition hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-600 ${typography} ${tone} ${
              selected ? "ring-2 ring-sky-600 ring-offset-1" : ""
            }`}
          >
            {block.kind === "list" ? `• ${block.text}` : block.text}
          </button>
        );
      })}
    </article>
  );
}

export function ResumeAnnotationViewer({ file }: { file: File | null }) {
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [pages, setPages] = useState<PageAnnotations[]>([]);
  const [docxBlocks, setDocxBlocks] = useState<DocxBlock[]>([]);
  const [selected, setSelected] = useState<ResumeAnnotation | null>(null);
  const [filter, setFilter] = useState<"all" | "review" | "neutral" | "strong">("all");
  const [zoom, setZoom] = useState(0.86);
  const [status, setStatus] = useState<
    "idle" | "loading" | "ready" | "docx-ready" | "unsupported" | "error"
  >("idle");

  const annotations = useMemo(
    () =>
      status === "docx-ready"
        ? docxBlocks.flatMap((block) => (block.annotation ? [block.annotation] : []))
        : pages.flatMap((page) => page.annotations),
    [docxBlocks, pages, status],
  );
  const visibleAnnotations = useMemo(
    () =>
      annotations.filter((annotation) => {
        if (filter === "all") return true;
        if (filter === "strong") return annotation.tone === "strong";
        if (filter === "neutral") return annotation.tone === "neutral";
        return annotation.tone === "critical" || annotation.tone === "review";
      }),
    [annotations, filter],
  );
  const visibleAnnotationIds = useMemo(
    () => new Set(visibleAnnotations.map((annotation) => annotation.id)),
    [visibleAnnotations],
  );
  const criticalCount = annotations.filter((item) => item.tone === "critical").length;
  const reviewCount = annotations.filter((item) => item.tone === "review").length;
  const neutralCount = annotations.filter((item) => item.tone === "neutral").length;
  const strongCount = annotations.filter((item) => item.tone === "strong").length;
  const signalGroups = useMemo(() => {
    const groups = new Map<
      string,
      { title: string; tone: AnnotationTone; count: number; example: ResumeAnnotation }
    >();
    for (const annotation of visibleAnnotations) {
      const key = `${annotation.tone}:${annotation.title}`;
      const current = groups.get(key);
      if (current) current.count += 1;
      else {
        groups.set(key, {
          title: annotation.title,
          tone: annotation.tone,
          count: 1,
          example: annotation,
        });
      }
    }
    return Array.from(groups.values()).sort((a, b) => b.count - a.count);
  }, [visibleAnnotations]);
  const selectedIndex = selected
    ? visibleAnnotations.findIndex((annotation) => annotation.id === selected.id)
    : -1;

  const moveSelection = (direction: -1 | 1) => {
    if (!visibleAnnotations.length) return;
    const currentIndex = selectedIndex >= 0 ? selectedIndex : 0;
    const nextIndex =
      (currentIndex + direction + visibleAnnotations.length) % visibleAnnotations.length;
    selectFromPanel(visibleAnnotations[nextIndex]);
  };

  useEffect(() => {
    const lowerName = file?.name.toLowerCase() ?? "";
    const isPdf = Boolean(file && (lowerName.endsWith(".pdf") || file.type === "application/pdf"));
    const isDocx = Boolean(
      file &&
      (lowerName.endsWith(".docx") ||
        file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document"),
    );

    if (!file || (!isPdf && !isDocx)) {
      setStatus(file ? "unsupported" : "idle");
      setPdf(null);
      setPages([]);
      setDocxBlocks([]);
      return;
    }

    let cancelled = false;
    let loadedPdf: PDFDocumentProxy | null = null;
    let loadingTask: PDFDocumentLoadingTask | null = null;
    setStatus("loading");
    setPdf(null);
    setPages([]);
    setDocxBlocks([]);
    setSelected(null);

    void (async () => {
      try {
        if (isDocx) {
          const blocks = await buildDocxBlocks(file);
          if (cancelled) return;
          const blockAnnotations = blocks.flatMap((block) =>
            block.annotation ? [block.annotation] : [],
          );
          setDocxBlocks(blocks);
          setSelected(
            blockAnnotations.find((item) => item.tone === "critical" || item.tone === "review") ??
              blockAnnotations[0] ??
              null,
          );
          setStatus("docx-ready");
          return;
        }

        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = new URL(
          "pdfjs-dist/build/pdf.worker.min.mjs",
          import.meta.url,
        ).toString();
        loadingTask = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
        loadedPdf = await loadingTask.promise;
        if (cancelled) {
          await loadingTask.destroy();
          return;
        }

        const pageCount = Math.min(loadedPdf.numPages, MAX_PREVIEW_PAGES);
        const models: PageAnnotations[] = [];
        for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
          const page = await loadedPdf.getPage(pageNumber);
          models.push(await buildPageAnnotations(page, pageNumber, PDF_SCALE));
          page.cleanup();
        }
        if (cancelled) return;
        setPdf(loadedPdf);
        setPages(models);
        setSelected(
          models
            .flatMap((page) => page.annotations)
            .find((item) => item.tone === "critical" || item.tone === "review") ??
            models.flatMap((page) => page.annotations)[0] ??
            null,
        );
        setStatus("ready");
      } catch {
        if (!cancelled) setStatus("error");
      }
    })();

    return () => {
      cancelled = true;
      if (loadingTask) void loadingTask.destroy();
    };
  }, [file]);

  const selectFromPanel = (annotation: ResumeAnnotation) => {
    setSelected(annotation);
    window.setTimeout(() => {
      document
        .getElementById(annotation.id)
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 0);
  };

  const changeFilter = (nextFilter: "all" | "review" | "neutral" | "strong") => {
    setFilter(nextFilter);
    const nextSelection = annotations.find((annotation) => {
      if (nextFilter === "all")
        return annotation.tone === "critical" || annotation.tone === "review";
      if (nextFilter === "strong") return annotation.tone === "strong";
      if (nextFilter === "neutral") return annotation.tone === "neutral";
      return annotation.tone === "critical" || annotation.tone === "review";
    });
    setSelected(nextSelection ?? (nextFilter === "all" ? annotations[0] : null) ?? null);
  };

  if (status === "idle") return null;

  return (
    <section className="glass relative overflow-hidden rounded-2xl border-primary/20 shadow-[0_28px_90px_-50px_hsl(var(--primary)/0.3)]">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-[radial-gradient(circle_at_12%_0%,hsl(var(--primary)/0.12),transparent_52%)]" />
      <div className="relative border-b border-border/80 p-6 md:px-8 md:py-7">
        <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-3xl">
            <div className="flex items-center gap-2 font-mono-label text-primary-glow">
              <Eye className="size-3.5" /> DOCUMENT REVIEW WORKSPACE
            </div>
            <h2 className="mt-3 font-display text-2xl font-semibold tracking-tight md:text-3xl">
              Review evidence in context.
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
              Select any marked line to inspect the evidence and a practical improvement. The
              original document stays central, and these deterministic checks never alter its score.
            </p>
          </div>
          {(status === "ready" || status === "docx-ready") && (
            <div className="grid grid-cols-4 self-start overflow-hidden rounded-xl border border-border/80 bg-black/20 xl:self-auto">
              {[
                [criticalCount, "Critical", "text-red-300"],
                [reviewCount, "Review", "text-amber-200"],
                [neutralCount, "Valid", "text-sky-300"],
                [strongCount, "Strong", "text-emerald-300"],
              ].map(([count, label, color], index) => (
                <div
                  key={label}
                  className={`min-w-24 px-4 py-3 text-center ${index ? "border-l border-border/70" : ""}`}
                >
                  <div className={`font-mono text-lg font-semibold ${color}`}>{count}</div>
                  <div className="mt-0.5 font-mono-label text-muted-foreground">{label}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {status === "loading" && (
        <div className="grid min-h-72 place-items-center p-8">
          <div className="text-center">
            <LoaderCircle className="mx-auto size-7 animate-spin text-primary-glow" />
            <p className="mt-3 text-sm text-muted-foreground">
              Preparing the private document preview...
            </p>
          </div>
        </div>
      )}

      {status === "unsupported" && (
        <div className="flex gap-3 p-6 text-sm text-muted-foreground md:p-8">
          <FileWarning className="mt-0.5 size-5 shrink-0 text-warning" />
          Visual evidence review is available for PDF and DOCX resumes. TXT analysis continues to
          work normally without a reconstructed document preview.
        </div>
      )}

      {status === "error" && (
        <div className="flex gap-3 p-6 text-sm text-muted-foreground md:p-8">
          <CircleAlert className="mt-0.5 size-5 shrink-0 text-warning" />
          The report is available, but this browser could not prepare the visual document evidence
          map.
        </div>
      )}

      {(status === "ready" || status === "docx-ready") && (pdf || docxBlocks.length > 0) && (
        <div className="grid min-w-0 lg:h-[min(78vh,780px)] lg:min-h-[650px] lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="flex min-w-0 flex-col border-b border-border bg-black/25 p-3 sm:p-5 lg:min-h-0 lg:border-b-0 lg:border-r">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/80 bg-surface/90 p-2.5 shadow-sm">
              <div
                className="flex flex-wrap gap-2"
                role="group"
                aria-label="Resume annotation filter"
              >
                {(
                  [
                    ["all", "All signals"],
                    ["review", "Needs review"],
                    ["neutral", "Valid evidence"],
                    ["strong", "Strong evidence"],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    type="button"
                    key={value}
                    aria-pressed={filter === value}
                    onClick={() => changeFilter(value)}
                    className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                      filter === value
                        ? "border-primary/45 bg-primary/10 text-primary-glow"
                        : "border-border text-muted-foreground hover:border-primary/25 hover:text-foreground"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-1">
                <span className="mr-2 hidden items-center gap-1.5 font-mono-label text-muted-foreground sm:inline-flex">
                  <ShieldCheck className="size-3.5 text-primary-glow" />
                  {status === "docx-ready" ? "Reconstructed DOCX preview" : "Private preview"}
                </span>
                {pdf && (
                  <>
                    <button
                      type="button"
                      aria-label="Zoom out"
                      onClick={() => setZoom((value) => Math.max(0.62, value - 0.1))}
                      className="grid size-8 place-items-center rounded-lg border border-border text-muted-foreground transition hover:border-primary/30 hover:text-foreground"
                    >
                      <Minus className="size-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setZoom(0.86)}
                      className="h-8 min-w-14 rounded-lg border border-border px-2 font-mono text-[10px] text-muted-foreground transition hover:border-primary/30 hover:text-foreground"
                    >
                      {Math.round(zoom * 100)}%
                    </button>
                    <button
                      type="button"
                      aria-label="Zoom in"
                      onClick={() => setZoom((value) => Math.min(1.35, value + 0.1))}
                      className="grid size-8 place-items-center rounded-lg border border-border text-muted-foreground transition hover:border-primary/30 hover:text-foreground"
                    >
                      <Plus className="size-3.5" />
                    </button>
                  </>
                )}
              </div>
            </div>

            <div className="relative min-h-[520px] flex-1 space-y-5 overflow-auto rounded-xl border border-border/70 bg-[radial-gradient(circle_at_50%_0%,rgba(48,72,55,0.28),transparent_45%),#070a08] p-4 sm:p-7 lg:min-h-0">
              <div className="pointer-events-none absolute inset-x-6 top-4 flex items-center justify-between font-mono-label text-muted-foreground/70">
                <span className="inline-flex items-center gap-1.5">
                  <Layers3 className="size-3" />
                  {status === "docx-ready"
                    ? `${docxBlocks.length} document blocks`
                    : `${pages.length} page${pages.length === 1 ? "" : "s"}`}
                </span>
                <span>{visibleAnnotations.length} visible signals</span>
              </div>
              <div className="h-4" />
              {pdf
                ? pages.map((page) => (
                    <PdfPagePreview
                      key={page.page}
                      pdf={pdf}
                      pageModel={{
                        ...page,
                        annotations: page.annotations.filter((annotation) =>
                          visibleAnnotationIds.has(annotation.id),
                        ),
                      }}
                      selectedId={selected?.id ?? null}
                      onSelect={setSelected}
                      zoom={zoom}
                    />
                  ))
                : docxBlocks.length > 0 && (
                    <DocxPreview
                      blocks={docxBlocks}
                      visibleAnnotationIds={visibleAnnotationIds}
                      selectedId={selected?.id ?? null}
                      onSelect={setSelected}
                    />
                  )}
            </div>
            {pdf && pdf.numPages > MAX_PREVIEW_PAGES && (
              <p className="mt-3 text-center text-xs text-muted-foreground">
                Showing the first {MAX_PREVIEW_PAGES} of {pdf.numPages} pages to protect browser
                performance.
              </p>
            )}
            {status === "docx-ready" && (
              <p className="mt-3 text-center text-xs leading-relaxed text-muted-foreground">
                Reconstructed from DOCX reading order. Word pagination and exact visual spacing may
                differ from the original document.
              </p>
            )}
          </div>

          <aside className="flex min-w-0 flex-col bg-surface/25 p-4 sm:p-5 lg:min-h-0 lg:overflow-hidden">
            <div className="flex items-center justify-between gap-3 border-b border-border/70 pb-4">
              <div>
                <div className="flex items-center gap-2 font-mono-label text-primary-glow">
                  <MousePointerClick className="size-3.5" /> SIGNAL INSPECTOR
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {visibleAnnotations.length
                    ? `${Math.max(selectedIndex + 1, 1)} of ${visibleAnnotations.length}`
                    : "No signals in this filter"}
                </p>
              </div>
              <div className="flex gap-1">
                <button
                  type="button"
                  aria-label="Previous signal"
                  disabled={!visibleAnnotations.length}
                  onClick={() => moveSelection(-1)}
                  className="grid size-9 place-items-center rounded-lg border border-border text-muted-foreground transition hover:border-primary/30 hover:text-foreground disabled:opacity-40"
                >
                  <ChevronLeft className="size-4" />
                </button>
                <button
                  type="button"
                  aria-label="Next signal"
                  disabled={!visibleAnnotations.length}
                  onClick={() => moveSelection(1)}
                  className="grid size-9 place-items-center rounded-lg border border-border text-muted-foreground transition hover:border-primary/30 hover:text-foreground disabled:opacity-40"
                >
                  <ChevronRight className="size-4" />
                </button>
              </div>
            </div>

            <div className="mt-3 h-1 overflow-hidden rounded-full bg-border/70">
              <div
                className="h-full rounded-full bg-gradient-to-r from-primary to-primary-glow transition-[width] duration-300"
                style={{
                  width: visibleAnnotations.length
                    ? `${((Math.max(selectedIndex, 0) + 1) / visibleAnnotations.length) * 100}%`
                    : "0%",
                }}
              />
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pr-1 [scrollbar-color:hsl(var(--border))_transparent] [scrollbar-width:thin]">
              {selected ? (
                <div className="mt-4 overflow-hidden rounded-xl border border-primary/25 bg-[linear-gradient(145deg,hsl(var(--primary)/0.09),transparent_48%)] shadow-[0_18px_50px_-35px_hsl(var(--primary)/0.5)]">
                  <div className="h-1 bg-gradient-to-r from-primary via-primary-glow to-transparent" />
                  <div className="p-4">
                    <div className="flex items-start gap-3">
                      {selected.tone === "strong" || selected.tone === "neutral" ? (
                        <CheckCircle2
                          className={`mt-0.5 size-5 shrink-0 ${
                            selected.tone === "strong" ? "text-emerald-400" : "text-sky-300"
                          }`}
                        />
                      ) : (
                        <CircleAlert
                          className={`mt-0.5 size-5 shrink-0 ${
                            selected.tone === "critical" ? "text-red-400" : "text-amber-300"
                          }`}
                        />
                      )}
                      <div>
                        <div className="font-mono-label text-primary-glow">
                          {status === "docx-ready" ? "DOCX" : `Page ${selected.page}`} ·{" "}
                          {selected.section} · {selected.tone} · {selected.confidence} confidence
                        </div>
                        <h3 className="mt-1 font-display text-lg font-semibold">
                          {selected.title}
                        </h3>
                      </div>
                    </div>
                    <blockquote className="mt-3 line-clamp-2 border-l-2 border-primary/35 pl-3 text-xs leading-relaxed text-muted-foreground">
                      {selected.text}
                    </blockquote>
                    <p className="mt-3 text-xs leading-relaxed text-foreground/90">
                      {selected.detail}
                    </p>
                    <div className="mt-3 rounded-lg border border-border bg-surface/60 p-3">
                      <div className="font-mono-label text-primary-glow">Recommended action</div>
                      <p className="mt-1.5 whitespace-normal text-xs leading-relaxed text-muted-foreground">
                        {selected.recommendation}
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="mt-4 rounded-xl border border-border bg-surface-2/30 p-5 text-sm text-muted-foreground">
                  Select a highlighted line to see its explanation and recommendation.
                </div>
              )}

              <div className="mt-4 flex items-center justify-between">
                <div className="flex items-center gap-2 font-mono-label text-muted-foreground">
                  <Layers3 className="size-3.5" /> SIGNAL THEMES
                </div>
                <span className="font-mono-label text-muted-foreground">
                  {signalGroups.length} groups
                </span>
              </div>
              <div className="mt-2 grid gap-1.5 pb-2">
                {signalGroups.map((group) => {
                  const isActive = selected
                    ? selected.title === group.title && selected.tone === group.tone
                    : false;
                  return (
                    <button
                      type="button"
                      key={`${group.tone}:${group.title}`}
                      onClick={() => selectFromPanel(group.example)}
                      aria-pressed={isActive}
                      className={`group w-full rounded-xl border px-3 py-2 text-left transition ${
                        isActive
                          ? "border-primary/40 bg-primary/[0.07]"
                          : "border-border/70 bg-surface/30 hover:border-primary/25"
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <span
                          className={`grid size-7 shrink-0 place-items-center rounded-lg border font-mono text-[11px] font-semibold ${
                            group.tone === "critical"
                              ? "border-red-500/25 bg-red-500/10 text-red-300"
                              : group.tone === "strong"
                                ? "border-emerald-400/25 bg-emerald-400/10 text-emerald-300"
                                : group.tone === "neutral"
                                  ? "border-sky-400/25 bg-sky-400/10 text-sky-200"
                                  : "border-amber-400/25 bg-amber-400/10 text-amber-200"
                          }`}
                        >
                          {group.count}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-xs font-semibold">{group.title}</span>
                            <span className="shrink-0 font-mono-label text-muted-foreground">
                              {group.count === 1 ? "1 signal" : `${group.count} signals`}
                            </span>
                          </div>
                          <p className="mt-0.5 text-[10px] capitalize text-muted-foreground">
                            {group.tone === "strong"
                              ? "Evidence to keep"
                              : group.tone === "neutral"
                                ? "Valid descriptive evidence"
                                : "Review opportunity"}
                          </p>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="relative z-10 mt-3 shrink-0 border-t border-border/70 bg-surface/95 pt-3 text-[10px] leading-relaxed text-muted-foreground backdrop-blur-sm">
              Deterministic evidence guidance · zero LLM API cost · not a hiring decision
            </div>
          </aside>
        </div>
      )}
    </section>
  );
}
