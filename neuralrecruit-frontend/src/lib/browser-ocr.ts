const MAX_OCR_PAGES = 2;
const OCR_RENDER_SCALE = 96 / 72;
const MAX_PIXELS_PER_PAGE = 6_000_000;
const MIN_MEANINGFUL_CHARACTERS = 40;

export interface BrowserOcrProgress {
  message: string;
  progress?: number;
}

function meaningfulCharacterCount(text: string): number {
  return text.replace(/\s+/g, "").length;
}

function isPdf(file: File): boolean {
  return file.name.toLowerCase().endsWith(".pdf") || file.type === "application/pdf";
}

/**
 * Detects image-only PDF pages and OCRs only those pages in the browser.
 *
 * Both PDF.js and Tesseract are dynamically imported, so this module adds no
 * OCR code to the initial application bundle. Searchable PDFs return
 * `undefined` and continue through the existing server extraction path.
 */
export async function extractScannedPdfText(
  file: File,
  onProgress?: (progress: BrowserOcrProgress) => void,
): Promise<string | undefined> {
  if (!isPdf(file)) return undefined;

  onProgress?.({ message: "Checking whether this PDF contains searchable text…" });

  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.min.mjs",
    import.meta.url,
  ).toString();

  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(await file.arrayBuffer()),
    isEvalSupported: false,
  });
  const pdfDocument = await loadingTask.promise;

  const pageTexts: string[] = [];
  const scannedPageNumbers: number[] = [];

  try {
    for (let pageNumber = 1; pageNumber <= pdfDocument.numPages; pageNumber += 1) {
      const page = await pdfDocument.getPage(pageNumber);
      const content = await page.getTextContent();
      const nativeText = content.items
        .map((item) => ("str" in item ? item.str : ""))
        .join(" ")
        .trim();

      pageTexts.push(nativeText);
      if (meaningfulCharacterCount(nativeText) < MIN_MEANINGFUL_CHARACTERS) {
        scannedPageNumbers.push(pageNumber);
      }
      page.cleanup();
    }

    if (scannedPageNumbers.length === 0) return undefined;
    if (scannedPageNumbers.length > MAX_OCR_PAGES) {
      throw new Error(
        `This PDF contains ${scannedPageNumbers.length} scanned pages. Browser OCR currently supports up to ${MAX_OCR_PAGES} scanned pages to protect device performance.`,
      );
    }

    onProgress?.({
      message: "Loading private browser OCR. Your resume stays on this device…",
      progress: 0,
    });

    const { createWorker } = await import("tesseract.js");
    let activePage = 1;
    const worker = await createWorker("eng", 1, {
      logger: (event) => {
        if (event.status !== "recognizing text") return;
        onProgress?.({
          message: `Reading text from scanned page ${activePage} of ${scannedPageNumbers.length}…`,
          progress: event.progress,
        });
      },
    });

    try {
      for (let index = 0; index < scannedPageNumbers.length; index += 1) {
        activePage = index + 1;
        const pageNumber = scannedPageNumbers[index];
        const page = await pdfDocument.getPage(pageNumber);
        const viewport = page.getViewport({ scale: OCR_RENDER_SCALE });
        const pixelCount = Math.ceil(viewport.width) * Math.ceil(viewport.height);

        if (pixelCount > MAX_PIXELS_PER_PAGE) {
          page.cleanup();
          throw new Error(
            "A scanned PDF page is too large to process safely in this browser. Please export it at a lower resolution.",
          );
        }

        onProgress?.({
          message: `Preparing scanned page ${activePage} of ${scannedPageNumbers.length}…`,
          progress: 0,
        });

        const canvas = document.createElement("canvas");
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        const context = canvas.getContext("2d", { alpha: false });
        if (!context) {
          page.cleanup();
          throw new Error("This browser could not create the OCR workspace.");
        }

        await page.render({ canvas, canvasContext: context, viewport }).promise;
        const recognition = await worker.recognize(canvas);
        pageTexts[pageNumber - 1] = recognition.data.text.trim();

        canvas.width = 1;
        canvas.height = 1;
        page.cleanup();
      }
    } finally {
      await worker.terminate();
    }
  } finally {
    await loadingTask.destroy();
  }

  const extractedText = pageTexts.filter(Boolean).join("\n\n").trim();
  if (meaningfulCharacterCount(extractedText) < MIN_MEANINGFUL_CHARACTERS) {
    throw new Error(
      "Browser OCR could not read enough text from this PDF. Please upload a clearer scan or a searchable PDF.",
    );
  }

  onProgress?.({ message: "Scanned text is ready. Starting resume analysis…", progress: 1 });
  return extractedText;
}
