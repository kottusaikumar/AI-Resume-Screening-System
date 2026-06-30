"""
text_extraction.py
------------------
Extracts plain text from PDF, DOCX, and TXT resume files.
Uses PyMuPDF (fitz) for PDFs — faster and more robust than pdfplumber —
and python-docx for DOCX files.
"""

import os
import fitz  # PyMuPDF
import docx

SUPPORTED_EXTENSIONS = {".pdf", ".docx", ".txt"}


class UnsupportedFileTypeError(ValueError):
    pass


def extract_text_from_pdf(path: str) -> str:
    text = []
    try:
        with fitz.open(path) as doc:
            for page in doc:
                text.append(page.get_text())
    except Exception as e:
        raise RuntimeError(f"Failed to read PDF: {e}") from e
    return "\n".join(text)


def extract_text_from_docx(path: str) -> str:
    try:
        doc = docx.Document(path)
        return "\n".join(para.text for para in doc.paragraphs)
    except Exception as e:
        raise RuntimeError(f"Failed to read DOCX: {e}") from e


def extract_text_from_txt(path: str) -> str:
    try:
        with open(path, "r", encoding="utf-8", errors="replace") as f:
            return f.read()
    except Exception as e:
        raise RuntimeError(f"Failed to read TXT: {e}") from e


def extract_text(file_path: str) -> str:
    ext = os.path.splitext(file_path)[1].lower()
    if ext == ".pdf":
        return extract_text_from_pdf(file_path)
    elif ext == ".docx":
        return extract_text_from_docx(file_path)
    elif ext == ".txt":
        return extract_text_from_txt(file_path)
    else:
        raise UnsupportedFileTypeError(
            f"Unsupported file type '{ext}'. "
            f"Supported: {', '.join(sorted(SUPPORTED_EXTENSIONS))}"
        )
