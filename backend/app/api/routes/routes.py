import csv
import io
import logging
import secrets
import threading
import time
from collections import deque
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from pathlib import Path
from uuid import uuid4

import cv2
from fastapi import APIRouter, File, Form, HTTPException, Query, Request, UploadFile
from fastapi.responses import FileResponse, StreamingResponse
from starlette.concurrency import run_in_threadpool

from app import config
from app.database import store
from app.schemas import LoginRequest, SettingsUpdate
from app.services import enhancement_service
from app.services.image_service import decode_uploaded_image, process_image
from app.services.model_service import ModelUnavailable, models
from app.security import create_access_token
from app.services.upload_service import save_upload
from app.services.video_service import process_video


router = APIRouter(prefix="/api")
logger = logging.getLogger(__name__)
video_executor = ThreadPoolExecutor(max_workers=config.VIDEO_WORKERS, thread_name_prefix="roadvision-video")
video_slots = threading.BoundedSemaphore(config.VIDEO_WORKERS)
INFERENCE_LIMIT = 50
LOGIN_FAILURE_LIMIT = 8
LOGIN_FAILURE_WINDOW_SECONDS = 15 * 60
login_failures: dict[str, deque[float]] = {}
login_failures_lock = threading.Lock()


def _check_login_rate_limit(client_key: str) -> None:
    now = time.monotonic()
    with login_failures_lock:
        failures = login_failures.setdefault(client_key, deque())
        while failures and now - failures[0] >= LOGIN_FAILURE_WINDOW_SECONDS:
            failures.popleft()
        if len(failures) >= LOGIN_FAILURE_LIMIT:
            raise HTTPException(status_code=429, detail="Too many sign-in attempts. Try again in 15 minutes.")


def _record_login_failure(client_key: str) -> None:
    with login_failures_lock:
        login_failures.setdefault(client_key, deque()).append(time.monotonic())


def _clear_login_failures(client_key: str) -> None:
    with login_failures_lock:
        login_failures.pop(client_key, None)


def _job_or_404(job_id: str) -> dict:
    job = store.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Detection job was not found.")
    return job


def _safe_result(job: dict) -> Path:
    name = job.get("result_name")
    if not name or Path(name).name != name:
        raise HTTPException(status_code=404, detail="The result file is not available.")
    path = (config.RESULT_DIR / name).resolve()
    if path.parent != config.RESULT_DIR.resolve() or not path.is_file():
        raise HTTPException(status_code=404, detail="The result file is not available.")
    return path


def _video_worker(job_id: str, input_path: Path, model_name: str) -> None:
    try:
        process_video(job_id, input_path, model_name)
    except Exception as error:
        logger.exception("Video processing failed for job %s", job_id)
        message = (
            "Video processing failed because model inference is unavailable. Check the model configuration and server logs."
            if isinstance(error, ModelUnavailable)
            else "Video processing failed. Check the file, codec, and server logs."
        )
        store.update_job(job_id, status="failed", progress=0, error=message)
        current = store.get_job(job_id)
        if current and current.get("result_name"):
            (config.RESULT_DIR / current["result_name"]).unlink(missing_ok=True)
        (config.RESULT_DIR / f"{job_id}.mp4").unlink(missing_ok=True)
    finally:
        if input_path.is_file():
            input_path.unlink(missing_ok=True)
        video_slots.release()


@router.get("/health")
def health() -> dict:
    model_status = models.list_models()
    return {
        "status": "ok",
        "service": "AI Road Vision API",
        "model_runtime_available": model_status["ultralytics_available"],
        "model_weights_available": model_status["weights_available"],
        "model_ready": model_status["ready"],
        "default_model": model_status["default_model"],
        "device": model_status["device"],
    }


@router.get("/auth/status")
def get_auth_status() -> dict:
    return {"enabled": config.AUTH_ENABLED}


@router.get("/auth/session")
def get_auth_session() -> dict:
    return {"authenticated": True}


@router.post("/auth/login")
def login(credentials: LoginRequest, request: Request) -> dict:
    if not config.AUTH_ENABLED:
        raise HTTPException(status_code=503, detail="Sign-in is not configured on this server.")
    client_key = request.client.host if request.client else "unknown"
    _check_login_rate_limit(client_key)
    username_matches = secrets.compare_digest(credentials.username.encode("utf-8"), config.AUTH_USERNAME.encode("utf-8"))
    password_matches = secrets.compare_digest(credentials.password.encode("utf-8"), config.AUTH_PASSWORD.encode("utf-8"))
    if not (username_matches and password_matches):
        _record_login_failure(client_key)
        raise HTTPException(status_code=401, detail="Username or password is incorrect.")
    _clear_login_failures(client_key)
    return {"access_token": create_access_token(), "token_type": "bearer", "expires_in": 12 * 60 * 60}


@router.get("/models")
def get_models() -> dict:
    return models.list_models()


@router.get("/enhancement/status")
def get_enhancement_status() -> dict:
    return enhancement_service.status()


@router.post("/detect/image")
async def detect_image(
    file: UploadFile = File(...),
    confidence: float | None = Form(default=None, ge=0.05, le=0.95),
    model: str | None = Form(default=None),
) -> dict:
    input_path, filename, _ = await save_upload(file, "image")
    job_id = uuid4().hex
    selected = model or config.MODEL_PATH
    selected_name = Path(selected).name
    threshold = confidence if confidence is not None else store.read_settings()["confidence_threshold"]
    try:
        if not await run_in_threadpool(decode_uploaded_image, input_path):
            raise HTTPException(status_code=415, detail="OpenCV could not decode this image.")
        try:
            models.resolve_model(selected_name)
        except ModelUnavailable as error:
            raise HTTPException(status_code=503, detail=str(error)) from error
        store.create_job(
            {
                "id": job_id,
                "kind": "image",
                "filename": filename,
                "input_name": input_path.name,
                "result_name": None,
                "status": "processing",
                "model": selected_name,
                "confidence": threshold,
                "tracking": False,
                "frame_interval": 1,
            }
        )
        try:
            return await run_in_threadpool(process_image, job_id, input_path, threshold, selected_name)
        except ModelUnavailable as error:
            store.update_job(job_id, status="failed", error=str(error))
            raise HTTPException(status_code=503, detail=str(error)) from error
        except Exception as error:
            store.update_job(job_id, status="failed", error="Image processing failed.")
            raise HTTPException(status_code=422, detail="Image processing failed. Check the image and model configuration.") from error
    finally:
        input_path.unlink(missing_ok=True)


@router.post("/detect/video", status_code=202)
async def detect_video(
    file: UploadFile = File(...),
    confidence: float | None = Form(default=None, ge=0.05, le=0.95),
    frame_interval: int = Form(default=1, ge=1, le=60),
    tracking: bool = Form(default=False),
    model: str | None = Form(default=None),
) -> dict:
    if not video_slots.acquire(blocking=False):
        raise HTTPException(status_code=429, detail="The video processing queue is full. Try again when a job finishes.")
    input_path: Path | None = None
    try:
        input_path, filename, _ = await save_upload(file, "video")
        capture = cv2.VideoCapture(str(input_path))
        valid_video = capture.isOpened() and capture.get(cv2.CAP_PROP_FRAME_COUNT) > 0
        capture.release()
        if not valid_video:
            raise HTTPException(status_code=415, detail="OpenCV could not read this video.")
        selected = model or config.MODEL_PATH
        selected_name = Path(selected).name
        try:
            models.resolve_model(selected_name)
        except ModelUnavailable as error:
            raise HTTPException(status_code=503, detail=str(error)) from error
        threshold = confidence if confidence is not None else store.read_settings()["confidence_threshold"]
        job_id = uuid4().hex
        store.create_job(
            {
                "id": job_id,
                "kind": "video",
                "filename": filename,
                "input_name": input_path.name,
                "result_name": None,
                "status": "processing",
                "model": selected_name,
                "confidence": threshold,
                "tracking": tracking,
                "frame_interval": frame_interval,
            }
        )
        try:
            video_executor.submit(_video_worker, job_id, input_path, selected_name)
        except Exception as error:
            store.update_job(job_id, status="failed", progress=0, error="The video job could not be started.")
            raise HTTPException(status_code=503, detail="The video job could not be started.") from error
        return {"job_id": job_id, "status": "processing", "filename": filename, "tracking": tracking}
    except Exception:
        if input_path and input_path.is_file():
            input_path.unlink(missing_ok=True)
        video_slots.release()
        raise


@router.get("/jobs")
def get_jobs(
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    kind: str | None = Query(default=None, pattern="^(image|video)$"),
) -> dict:
    return {"jobs": store.list_jobs(limit=limit, offset=offset, kind=kind), "limit": limit, "offset": offset}


@router.get("/jobs/{job_id}")
def get_job(job_id: str) -> dict:
    return _job_or_404(job_id)


@router.get("/jobs/{job_id}/detections")
def get_detections(
    job_id: str,
    limit: int = Query(default=1000, ge=1, le=10000),
    offset: int = Query(default=0, ge=0),
    category: str | None = Query(default=None, max_length=80),
) -> dict:
    _job_or_404(job_id)
    return {
        "job_id": job_id,
        "detections": store.list_detections(job_id, limit=limit, offset=offset, category=category),
        "limit": limit,
        "offset": offset,
    }


@router.get("/jobs/{job_id}/tracks")
def get_tracks(job_id: str) -> dict:
    job = _job_or_404(job_id)
    if job["kind"] != "video":
        raise HTTPException(status_code=409, detail="Object tracks are available for video jobs only.")
    return {"job_id": job_id, "tracks": store.list_tracks(job_id)}


@router.delete("/jobs/{job_id}")
def remove_job(job_id: str) -> dict:
    job = _job_or_404(job_id)
    if job["status"] == "processing":
        raise HTTPException(status_code=409, detail="A processing job cannot be deleted yet.")
    for directory, name in ((config.UPLOAD_DIR, job.get("input_name")), (config.RESULT_DIR, job.get("result_name"))):
        if name and Path(name).name == name:
            (directory / name).unlink(missing_ok=True)
    store.delete_job(job_id)
    return {"deleted": True, "job_id": job_id}


@router.get("/analytics/summary")
def get_analytics(
    job_id: str | None = Query(default=None),
    category: str | None = Query(default=None, max_length=80),
) -> dict:
    if job_id:
        _job_or_404(job_id)
    return store.analytics(job_id=job_id, category=category)


@router.get("/jobs/{job_id}/download")
def download_result(job_id: str) -> FileResponse:
    job = _job_or_404(job_id)
    if job["status"] != "completed":
        raise HTTPException(status_code=409, detail="The annotated result is not ready yet.")
    path = _safe_result(job)
    media_type = "video/mp4" if path.suffix.lower() == ".mp4" else "image/jpeg"
    return FileResponse(path, media_type=media_type, filename=f"{Path(job['filename']).stem}-annotated{path.suffix}")


@router.get("/jobs/{job_id}/report.csv")
def download_report(job_id: str, category: str | None = Query(default=None, max_length=80)) -> StreamingResponse:
    job = _job_or_404(job_id)
    if job["status"] != "completed":
        raise HTTPException(status_code=409, detail="The report is available after processing completes.")
    headers, rows = store.csv_rows(job_id, category)
    content = io.StringIO(newline="")
    writer = csv.DictWriter(content, fieldnames=headers, extrasaction="ignore")
    writer.writeheader()
    writer.writerows(rows)
    return StreamingResponse(
        iter([content.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{job_id}-detections.csv"'},
    )


@router.get("/settings")
def get_settings() -> dict:
    return {
        **store.read_settings(),
        "models": models.list_models(),
        "enhancement": enhancement_service.status(),
        "supported_image_formats": [".jpg", ".jpeg", ".png", ".webp"],
        "supported_video_formats": [".mp4", ".avi", ".mov", ".mkv"],
    }


@router.patch("/settings")
def patch_settings(settings: SettingsUpdate) -> dict:
    updates = settings.model_dump(exclude_none=True)
    return store.update_settings(updates)


@router.post("/settings/cleanup")
def cleanup_files() -> dict:
    cutoff = (datetime.now(timezone.utc) - timedelta(days=config.RETENTION_DAYS)).isoformat(timespec="seconds")
    removed = store.delete_jobs_before(cutoff)
    for job in removed:
        for directory, name in ((config.UPLOAD_DIR, job.get("input_name")), (config.RESULT_DIR, job.get("result_name"))):
            if name and Path(name).name == name:
                (directory / name).unlink(missing_ok=True)
    return {"deleted_jobs": len(removed), "retention_days": config.RETENTION_DAYS}
