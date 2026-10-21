from collections import Counter
from pathlib import Path
from time import perf_counter

import cv2

from app import config
from app.database import store
from app.services.image_service import _as_detection
from app.services.model_service import models


def process_video(job_id: str, input_path: Path, model_name: str) -> None:
    job = store.get_job(job_id)
    if not job:
        return
    if job["tracking"]:
        with models.tracking_session(model_name):
            _process_video(job_id, input_path, model_name, job)
        return
    _process_video(job_id, input_path, model_name, job)


def _process_video(job_id: str, input_path: Path, model_name: str, job: dict) -> None:
    capture = cv2.VideoCapture(str(input_path))
    if not capture.isOpened():
        raise ValueError("OpenCV could not open this video.")
    total_frames = max(0, int(capture.get(cv2.CAP_PROP_FRAME_COUNT)))
    source_fps = capture.get(cv2.CAP_PROP_FPS)
    source_fps = source_fps if source_fps and source_fps > 0 else 25.0
    width = int(capture.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(capture.get(cv2.CAP_PROP_FRAME_HEIGHT))
    if width < 1 or height < 1:
        capture.release()
        raise ValueError("The video does not contain readable frames.")
    output_path = config.RESULT_DIR / f"{job_id}.mp4"
    writer = cv2.VideoWriter(
        str(output_path),
        cv2.VideoWriter_fourcc(*"mp4v"),
        source_fps,
        (width, height),
    )
    if not writer.isOpened():
        capture.release()
        raise ValueError("The server could not create an MP4 result file.")
    interval = max(1, int(job["frame_interval"]))
    tracking = bool(job["tracking"])
    tracker = "bytetrack.yaml"
    frame_index = 0
    processed_frames = 0
    detections_count = 0
    class_counts: Counter[str] = Counter()
    track_ids: set[int] = set()
    pending_detections: list[dict] = []
    started = perf_counter()
    try:
        while True:
            ok, frame = capture.read()
            if not ok:
                break
            if frame_index % interval == 0:
                result, _ = models.infer(
                    frame,
                    float(job["confidence"]),
                    model_name,
                    tracking=tracking,
                    tracker=tracker,
                    image_size=config.VIDEO_IMAGE_SIZE,
                )
                detections = [_as_detection(box, result.names) for box in result.boxes]
                timestamp = frame_index / source_fps
                for detection in detections:
                    detection["frame_index"] = frame_index
                    detection["timestamp_seconds"] = timestamp
                    class_counts[detection["class_name"]] += 1
                    if detection["track_id"] is not None:
                        track_ids.add(detection["track_id"])
                pending_detections.extend(detections)
                detections_count += len(detections)
                writer.write(result.plot(line_width=2, font_size=12))
                processed_frames += 1
            else:
                writer.write(frame)
            frame_index += 1
            if frame_index % max(interval, 10) == 0 or frame_index == total_frames:
                store.add_detections(job_id, pending_detections)
                pending_detections.clear()
                progress = min(99.0, frame_index / max(total_frames, 1) * 100)
                store.update_job(
                    job_id,
                    progress=progress,
                    processed_frames=processed_frames,
                    total_frames=total_frames or None,
                    detections_count=detections_count,
                    class_counts=dict(class_counts),
                    unique_tracks=len(track_ids),
                )
    finally:
        capture.release()
        writer.release()
    store.add_detections(job_id, pending_detections)
    elapsed = perf_counter() - started
    if total_frames > 0 and frame_index < total_frames:
        output_path.unlink(missing_ok=True)
        raise ValueError("The video ended before all reported frames could be decoded.")
    if frame_index == 0 or processed_frames == 0:
        output_path.unlink(missing_ok=True)
        raise ValueError("No video frames were available for detection.")
    if not output_path.is_file() or output_path.stat().st_size == 0:
        raise ValueError("The annotated video could not be written.")
    duration = frame_index / source_fps
    store.update_job(
        job_id,
        status="completed",
        result_name=output_path.name,
        progress=100,
        processing_time_seconds=elapsed,
        processing_fps=processed_frames / elapsed if elapsed else None,
        duration_seconds=duration,
        total_frames=total_frames or frame_index,
        processed_frames=processed_frames,
        detections_count=detections_count,
        unique_tracks=len(track_ids),
        class_counts=dict(class_counts),
        error=None,
    )
