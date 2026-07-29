import fitz
import pytest

from app.core import config
from app.core import text_extraction


def _save_pdf(path, page_count: int = 1, text: str | None = None) -> None:
    document = fitz.open()
    for _ in range(page_count):
        page = document.new_page()
        if text:
            page.insert_text((72, 72), text)
    document.save(path)
    document.close()


def test_text_pdf_skips_ocr(tmp_path, monkeypatch):
    pdf_path = tmp_path / "text-resume.pdf"
    native_text = (
        "Experienced software engineer with Python, FastAPI, SQL, testing, "
        "cloud deployment, and accessible frontend development."
    )
    _save_pdf(pdf_path, text=native_text)

    def unexpected_ocr(_page):
        raise AssertionError("OCR should not run for a PDF with usable embedded text")

    monkeypatch.setattr(text_extraction, "_ocr_pdf_page", unexpected_ocr)

    extracted = text_extraction.extract_text_from_pdf(str(pdf_path))

    assert extracted.startswith("Experienced software engineer with Python")
    assert len(extracted) > config.PDF_OCR_MIN_TEXT_CHARS


def test_image_only_pdf_uses_local_ocr_fallback(tmp_path, monkeypatch):
    pdf_path = tmp_path / "scanned-resume.pdf"
    _save_pdf(pdf_path)
    monkeypatch.setattr(
        text_extraction,
        "_ocr_pdf_page",
        lambda _page: "Candidate resume extracted by local OCR",
    )

    extracted = text_extraction.extract_text_from_pdf(str(pdf_path))

    assert extracted == "Candidate resume extracted by local OCR"


def test_image_only_pdf_can_skip_server_ocr(tmp_path, monkeypatch):
    pdf_path = tmp_path / "browser-ocr-resume.pdf"
    _save_pdf(pdf_path)

    def unexpected_ocr(_page):
        raise AssertionError("Server OCR must remain disabled for browser-OCR uploads")

    monkeypatch.setattr(text_extraction, "_ocr_pdf_page", unexpected_ocr)

    assert text_extraction.extract_text_from_pdf(str(pdf_path), enable_ocr=False) == ""


def test_scanned_pdf_page_limit_is_enforced(tmp_path, monkeypatch):
    pdf_path = tmp_path / "oversized-scan.pdf"
    _save_pdf(pdf_path, page_count=2)
    monkeypatch.setattr(config, "PDF_OCR_MAX_PAGES", 1)
    monkeypatch.setattr(text_extraction, "_ocr_pdf_page", lambda _page: "OCR text")

    with pytest.raises(RuntimeError, match="too many scanned pages"):
        text_extraction.extract_text_from_pdf(str(pdf_path))
