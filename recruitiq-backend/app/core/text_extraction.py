"""
text_extraction.py
------------------
Extracts plain text from PDF, DOCX, and TXT resume files.
Uses PyMuPDF for native PDF text and a local RapidOCR fallback for scanned
pages. OCR is loaded lazily and never calls an external service.
"""

import os
import re
import threading

import fitz  # PyMuPDF
import docx
from docx.document import Document as DocxDocument
from docx.table import Table, _Cell
from docx.text.paragraph import Paragraph
from docx.oxml.table import CT_Tbl
from docx.oxml.text.paragraph import CT_P

from app.core import config

SUPPORTED_EXTENSIONS = {".pdf", ".docx", ".txt"}
_ocr_engine = None
_ocr_engine_lock = threading.Lock()
_ocr_inference_lock = threading.Lock()


class UnsupportedFileTypeError(ValueError):
    pass


def _meaningful_character_count(text: str) -> int:
    return len(re.sub(r"\s+", "", text))


def _get_ocr_engine():
    """Create one process-wide local OCR engine only when it is needed."""
    global _ocr_engine
    if _ocr_engine is not None:
        return _ocr_engine

    with _ocr_engine_lock:
        if _ocr_engine is not None:
            return _ocr_engine
        try:
            from rapidocr import RapidOCR
        except ImportError as exc:
            raise RuntimeError(
                "This PDF contains scanned pages, but local OCR support is not installed."
            ) from exc
        _ocr_engine = RapidOCR()
        return _ocr_engine


def _ocr_pdf_page(page: fitz.Page) -> str:
    scale = config.PDF_OCR_DPI / 72
    pixmap = page.get_pixmap(matrix=fitz.Matrix(scale, scale), alpha=False)
    pixel_count = pixmap.width * pixmap.height
    if pixel_count > config.PDF_OCR_MAX_PIXELS_PER_PAGE:
        raise RuntimeError(
            "A scanned PDF page is too large to process safely. "
            "Please reduce the page resolution and try again."
        )

    engine = _get_ocr_engine()
    # Serialize inference to avoid multiplying the model's memory use when
    # several candidates are uploaded at once.
    with _ocr_inference_lock:
        result = engine(pixmap.tobytes("png"))

    lines = result.txts if result and result.txts else []
    cleaned_lines = []
    for line in lines:
        if not line or not line.strip():
            continue
        cleaned_lines.append(re.sub(r"^[\uFFFD•●▪◦]\s*", "- ", line.strip()))
    return "\n".join(cleaned_lines)


def extract_text_from_pdf(path: str, enable_ocr: bool | None = None) -> str:
    text: list[str] = []
    should_use_ocr = config.PDF_OCR_ENABLED if enable_ocr is None else enable_ocr
    try:
        with fitz.open(path) as doc:
            pages_needing_ocr = 0
            for page in doc:
                native_text = page.get_text("text", sort=True)
                if _meaningful_character_count(native_text) >= config.PDF_OCR_MIN_TEXT_CHARS:
                    text.append(native_text)
                    continue

                if not should_use_ocr:
                    text.append(native_text)
                    continue

                pages_needing_ocr += 1
                if pages_needing_ocr > config.PDF_OCR_MAX_PAGES:
                    raise RuntimeError(
                        "This PDF has too many scanned pages to process safely "
                        f"(maximum {config.PDF_OCR_MAX_PAGES})."
                    )
                text.append(_ocr_pdf_page(page))
    except Exception as e:
        if isinstance(e, RuntimeError):
            raise
        raise RuntimeError(f"Failed to read PDF: {e}") from e
    return "\n".join(text)


def _iter_docx_blocks(parent: DocxDocument | _Cell):
    """Yield paragraphs and tables in their actual document order."""
    container = parent.element.body if isinstance(parent, DocxDocument) else parent._tc
    for child in container.iterchildren():
        if isinstance(child, CT_P):
            yield Paragraph(child, parent)
        elif isinstance(child, CT_Tbl):
            yield Table(child, parent)


def _docx_table_text(table: Table) -> list[str]:
    lines: list[str] = []
    seen_cells: set[int] = set()
    for row in table.rows:
        row_parts: list[str] = []
        for cell in row.cells:
            # Merged cells can appear more than once in python-docx's row view.
            cell_identity = id(cell._tc)
            if cell_identity in seen_cells:
                continue
            seen_cells.add(cell_identity)
            cell_text = "\n".join(
                block.text.strip()
                if isinstance(block, Paragraph)
                else "\n".join(_docx_table_text(block))
                for block in _iter_docx_blocks(cell)
            ).strip()
            if cell_text:
                row_parts.append(cell_text)
        if row_parts:
            lines.append(" | ".join(row_parts))
    return lines


def extract_text_from_docx(path: str) -> str:
    try:
        doc = docx.Document(path)
        lines: list[str] = []
        for block in _iter_docx_blocks(doc):
            if isinstance(block, Paragraph):
                if block.text.strip():
                    lines.append(block.text)
            else:
                lines.extend(_docx_table_text(block))
        return "\n".join(lines)
    except Exception as e:
        raise RuntimeError(f"Failed to read DOCX: {e}") from e


def extract_text_from_txt(path: str) -> str:
    try:
        with open(path, "r", encoding="utf-8", errors="replace") as f:
            return f.read()
    except Exception as e:
        raise RuntimeError(f"Failed to read TXT: {e}") from e


def extract_text(file_path: str, enable_pdf_ocr: bool | None = None) -> str:
    ext = os.path.splitext(file_path)[1].lower()
    if ext == ".pdf":
        return extract_text_from_pdf(file_path, enable_ocr=enable_pdf_ocr)
    elif ext == ".docx":
        return extract_text_from_docx(file_path)
    elif ext == ".txt":
        return extract_text_from_txt(file_path)
    else:
        raise UnsupportedFileTypeError(
            f"Unsupported file type '{ext}'. "
            f"Supported: {', '.join(sorted(SUPPORTED_EXTENSIONS))}"
        )
