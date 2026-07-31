"""Deterministic file validation before document parsers see an upload."""

import io
import zipfile

MAX_DOCX_UNCOMPRESSED_BYTES = 100 * 1024 * 1024
MAX_DOCX_COMPRESSION_RATIO = 100


class UnsafeUploadError(ValueError):
    pass


def validate_file_signature(data: bytes, extension: str) -> None:
    if not data:
        raise UnsafeUploadError("The uploaded file is empty.")
    if extension == ".pdf":
        if not data.startswith(b"%PDF-"):
            raise UnsafeUploadError("The file content is not a valid PDF.")
        return
    if extension == ".docx":
        if not data.startswith(b"PK\x03\x04"):
            raise UnsafeUploadError("The file content is not a valid DOCX document.")
        try:
            with zipfile.ZipFile(io.BytesIO(data)) as archive:
                names = set(archive.namelist())
                if "[Content_Types].xml" not in names or "word/document.xml" not in names:
                    raise UnsafeUploadError("The DOCX document is missing required content.")
                if len(names) > 10_000:
                    raise UnsafeUploadError("The DOCX archive contains too many entries.")
                uncompressed = sum(item.file_size for item in archive.infolist())
                if (
                    uncompressed > MAX_DOCX_UNCOMPRESSED_BYTES
                    or uncompressed > len(data) * MAX_DOCX_COMPRESSION_RATIO
                ):
                    raise UnsafeUploadError("The DOCX archive expands beyond the safety limit.")
        except zipfile.BadZipFile as exc:
            raise UnsafeUploadError("The file content is not a valid DOCX document.") from exc
        return
    if extension == ".txt":
        if b"\x00" in data[:8192]:
            raise UnsafeUploadError("Binary content is not accepted as a TXT resume.")
        try:
            data[:8192].decode("utf-8")
        except UnicodeDecodeError as exc:
            raise UnsafeUploadError("TXT resumes must use UTF-8 encoding.") from exc
        return
    raise UnsafeUploadError("Unsupported file type.")
