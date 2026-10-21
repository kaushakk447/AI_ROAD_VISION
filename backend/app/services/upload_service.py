from pathlib import Path
from uuid import uuid4

from fastapi import HTTPException, UploadFile

from app import config


IMAGE_TYPES = {
    ".jpg": {"image/jpeg"},
    ".jpeg": {"image/jpeg"},
    ".png": {"image/png"},
    ".webp": {"image/webp"},
}
VIDEO_TYPES = {
    ".mp4": {"video/mp4"},
    ".avi": {"video/x-msvideo", "video/avi"},
    ".mov": {"video/quicktime"},
    ".mkv": {"video/x-matroska"},
}


class UploadLimitExceeded(Exception):
    pass


def _valid_signature(extension: str, content: bytes, kind: str) -> bool:
    if kind == "image":
        return {
            ".jpg": content.startswith(b"\xff\xd8\xff"),
            ".jpeg": content.startswith(b"\xff\xd8\xff"),
            ".png": content.startswith(b"\x89PNG\r\n\x1a\n"),
            ".webp": len(content) >= 12 and content[:4] == b"RIFF" and content[8:12] == b"WEBP",
        }.get(extension, False)
    return {
        ".mp4": len(content) >= 12 and content[4:8] == b"ftyp",
        ".mov": len(content) >= 12 and content[4:8] == b"ftyp",
        ".avi": len(content) >= 12 and content[:4] == b"RIFF" and content[8:12] == b"AVI ",
        ".mkv": content.startswith(b"\x1aE\xdf\xa3"),
    }.get(extension, False)


async def save_upload(upload: UploadFile, kind: str) -> tuple[Path, str, int]:
    filename = Path((upload.filename or "upload").replace("\\", "/")).name
    extension = Path(filename).suffix.lower()
    allowed = IMAGE_TYPES if kind == "image" else VIDEO_TYPES
    if extension not in allowed:
        raise HTTPException(status_code=415, detail=f"Unsupported {kind} format.")
    max_bytes = config.MAX_UPLOAD_MB * 1024 * 1024
    try:
        from app.database.store import read_settings

        max_bytes = read_settings()["max_upload_mb"] * 1024 * 1024
    except Exception:
        pass
    mime_type = (upload.content_type or "").lower()
    if mime_type and mime_type not in allowed[extension] and mime_type != "application/octet-stream":
        raise HTTPException(status_code=415, detail="The file content type does not match its extension.")
    target = config.UPLOAD_DIR / f"{uuid4().hex}{extension}"
    try:
        await upload.seek(0)
        size = 0
        signature = bytearray()
        with target.open("wb") as destination:
            while True:
                chunk = await upload.read(1024 * 1024)
                if not chunk:
                    break
                size += len(chunk)
                if size > max_bytes:
                    raise UploadLimitExceeded
                if len(signature) < 16:
                    signature.extend(chunk[: 16 - len(signature)])
                destination.write(chunk)
        if size == 0:
            raise HTTPException(status_code=400, detail="The uploaded file is empty.")
        if not _valid_signature(extension, bytes(signature), kind):
            raise HTTPException(status_code=415, detail="The file signature does not match a supported media file.")
        return target, filename[:255], size
    except UploadLimitExceeded as error:
        target.unlink(missing_ok=True)
        raise HTTPException(status_code=413, detail=f"File exceeds the {max_bytes // (1024 * 1024)} MB upload limit.") from error
    except Exception:
        target.unlink(missing_ok=True)
        raise
    finally:
        await upload.close()
