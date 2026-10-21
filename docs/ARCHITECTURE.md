# Architecture

## Runtime components

- `frontend/src/App.jsx` contains the routed dashboard pages and their API-backed interactions. `frontend/src/services/api.js` defines the shared Axios client and download URL helper.
- `backend/app/main.py` creates the FastAPI application, CORS policy, and startup lifecycle. Startup creates local storage and SQLite tables and marks interrupted video jobs as failed.
- `backend/app/api/routes/routes.py` validates requests, creates job records, returns reports and results, and submits videos to a bounded thread pool.
- `backend/app/services/model_service.py` discovers local weights, loads each selected model once, and serializes inference calls. The configured default can be downloaded by Ultralytics on first use.
- Image and video services decode inputs, run actual model predictions, annotate media, and persist structured detections.
- `backend/app/database/store.py` owns parameterized SQLite operations, job metadata, detection rows, track aggregation, and analytics queries.
- Uploaded and generated media are stored in UUID-named files below `ROADVISION_DATA_DIR`; client filenames are display metadata only.

## Job lifecycle

Image uploads run synchronously and return the completed prediction payload. Video uploads are validated and saved before a `processing` job is inserted; the request returns its ID immediately. A bounded worker processes sampled frames, stores detections and progress, then marks the job `completed` or `failed`. The client polls `GET /api/jobs/{id}`. On restart, jobs left in `processing` are marked failed rather than displayed as active indefinitely.

Video detection rows include the sampled frame number and timestamp. Tracking rows additionally include a tracker ID. The track endpoint groups these rows into observation counts, first/last frames, and center-point trajectories in image pixels. Counts in analytics represent detection observations, not unique objects.

## Local data and cleanup

SQLite uses foreign keys and WAL mode. Deleting a job removes its detection rows and associated input/result files. The cleanup action removes completed or failed jobs older than `ROADVISION_RETENTION_DAYS`; active jobs are retained. The service does not delete files automatically on a timer.

## Security boundaries

Uploads are checked by extension, declared MIME type when provided, byte signature, configured size, and OpenCV decoding. Files receive server-generated names. Download paths are resolved inside the configured results directory. SQL values are parameterized, settings are validated with Pydantic, and CORS defaults to the local Vite origins. The app does not include user authentication or public deployment controls.
