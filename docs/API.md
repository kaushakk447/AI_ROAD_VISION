# API reference

The local API base is `http://127.0.0.1:8000/api`. FastAPI's interactive documentation is available at `/docs`.

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/health` | API, runtime, configured-weight, model-readiness, and selected-device status |
| `GET` | `/models` | Configured and locally discovered model weights, device, and inference image size |
| `GET` | `/enhancement/status` | Optional Real-ESRGAN and weight availability |
| `POST` | `/detect/image` | Multipart image inference; fields: `file`, optional `confidence`, optional `model` |
| `POST` | `/detect/video` | Multipart background job; fields: `file`, optional `confidence`, `frame_interval`, `tracking`, and `model` |
| `GET` | `/jobs` | Paginated job history; optional `kind=image|video` |
| `GET` | `/jobs/{job_id}` | Job status, progress, metadata, counts, and result links |
| `GET` | `/jobs/{job_id}/detections` | Stored frame/image detections with optional `category`, `limit`, and `offset` |
| `GET` | `/jobs/{job_id}/tracks` | Per-track observations and sampled-frame center trajectories for video jobs |
| `DELETE` | `/jobs/{job_id}` | Remove a finished job, detections, and associated files |
| `GET` | `/analytics/summary` | Aggregate completed-job counts; optional `job_id` and `category` filters |
| `GET` | `/jobs/{job_id}/download` | Annotated image or MP4 result |
| `GET` | `/jobs/{job_id}/report.csv` | Download frame-level detection rows; optional `category` |
| `GET` | `/settings` | Runtime, model, enhancement, and user settings |
| `PATCH` | `/settings` | Update `confidence_threshold` and/or `max_upload_mb` |
| `POST` | `/settings/cleanup` | Delete completed/failed jobs past retention |

## Detection result

Image inference returns a completed result with `job_id`, `filename`, `model`, `processing_time_seconds`, image dimensions, `detections`, `class_counts`, and `annotated_result_url`. Each detection includes numeric `class_id`, `class_name`, confidence in `[0, 1]`, pixel bounding box coordinates, and a nullable `track_id`.

Video creation returns HTTP 202 and a `job_id`. Poll its job endpoint until `status` is `completed` or `failed`. Video `detections_count` and class counts are sampled frame observations; `unique_tracks` is the number of distinct non-null tracker IDs observed. `processing_fps` is sampled frames processed divided by measured processing time.

Errors use FastAPI's standard JSON detail response. Common statuses include `400` for empty uploads, `413` for size limits, `415` for unsupported or invalid media, `422` for invalid options or unreadable media, `429` when the video queue is full, and `503` when model inference is unavailable.

The health endpoint's `status: "ok"` means the API is serving; it does not mean weights are loaded. Check `model_runtime_available`, `model_weights_available`, and `model_ready` separately. The `/models` response includes `device` (`"0"`, another configured CUDA index, `"cpu"`, or `"unavailable"`) and `image_size`. The default `yolov8n.pt` is the only name eligible for automatic Ultralytics download; all other weights must be installed locally.
