from collections import Counter
from pathlib import Path
from time import perf_counter
from typing import Any

import cv2
import numpy as np

from app import config
from app.database import store
from app.services.model_service import ModelUnavailable, models


def _as_detection(box: Any, names: dict[int, str]) -> dict[str, Any]:
    coordinates = box.xyxy[0].cpu().tolist()
    class_id = int(box.cls[0].item())
    return {
        "class_id": class_id,
        "class_name": str(names.get(class_id, class_id)),
        "confidence": float(box.conf[0].item()),
        "bbox": {key: float(value) for key, value in zip(("x1", "y1", "x2", "y2"), coordinates)},
        "track_id": int(box.id[0].item()) if box.id is not None else None,
    }


def process_image(job_id: str, input_path: Path, confidence: float, model_name: str) -> dict[str, Any]:
    started = perf_counter()
    image = cv2.imread(str(input_path), cv2.IMREAD_COLOR)
    if image is None:
        raise ValueError("OpenCV could not decode this image.")
    height, width = image.shape[:2]
    result, selected = models.infer(image, confidence, model_name)
    detections = [_as_detection(box, result.names) for box in result.boxes]
    annotated = result.plot(line_width=2, font_size=12)
    output_path = config.RESULT_DIR / f"{job_id}.jpg"
    success, encoded = cv2.imencode(".jpg", annotated)
    if not success:
        raise ValueError("The annotated image could not be encoded.")
    output_path.write_bytes(encoded.tobytes())
    store.add_detections(job_id, detections)
    elapsed = perf_counter() - started
    class_counts = dict(Counter(item["class_name"] for item in detections))
    store.update_job(
        job_id,
        status="completed",
        result_name=output_path.name,
        progress=100,
        processing_time_seconds=elapsed,
        processing_fps=None,
        processed_frames=1,
        total_frames=1,
        detections_count=len(detections),
        class_counts=class_counts,
        error=None,
    )
    return {
        "job_id": job_id,
        "status": "completed",
        "filename": store.get_job(job_id)["filename"],
        "model": selected,
        "processing_time_seconds": elapsed,
        "image_width": width,
        "image_height": height,
        "detections": detections,
        "class_counts": class_counts,
        "annotated_result_url": f"/api/jobs/{job_id}/download",
        "error": None,
    }


def decode_uploaded_image(path: Path) -> bool:
    return cv2.imread(str(path), cv2.IMREAD_COLOR) is not None
