# AI Road Vision

AI Road Vision is a local-first computer-vision workspace for road imagery and video. It uses real Ultralytics YOLO predictions, optionally tracks objects in videos with ByteTrack, and stores job metadata and detections in SQLite. It is an educational traffic-analysis tool, not a vehicle control system.

## Features

- Image detection for JPG, JPEG, PNG, and WebP with annotated output and per-object confidence.
- Background video analysis for MP4, AVI, MOV, and MKV with frame sampling, progress, measured processing FPS, and downloadable annotated MP4.
- Optional ByteTrack IDs, unique track counts, per-track observation summaries, and sampled pixel-coordinate trajectories.
- Dashboard and traffic charts calculated from stored, completed jobs.
- SQLite detection history, job cleanup, and CSV reports.
- Configurable confidence and upload-size settings; local model discovery and runtime status.
- Automatic CUDA selection when PyTorch reports an available GPU, CPU fallback, and configurable inference image size.
- Optional enhancement status reporting. Real-ESRGAN inference is not configured in this build; no accuracy improvement is claimed.
- Responsive dark dashboard with image comparison, file validation, and processing states.

## Stack

- Frontend: React, Vite, React Router, Recharts, Lucide, and Axios.
- Backend: Python, FastAPI, SQLite, OpenCV, NumPy, and Ultralytics.
- Storage: local files under `backend/data` by default.

## Deployment

See [docs/deployment.md](docs/deployment.md) for deploying the frontend to Cloudflare Pages and the authenticated API to an Oracle Cloud Always Free VM. Always Free capacity and eligibility are subject to Oracle's current terms; the VM requires ongoing maintenance.

## Requirements

- Python 3.11 or newer. Python 3.12 is a convenient choice for Ultralytics and PyTorch package compatibility.
- Node.js 20.19 or newer, or 22.12 or newer, and npm.
- A local YOLO `.pt` file, or internet access on first use to let Ultralytics download the configured default weight (`yolov8n.pt`). Model download availability depends on the installed PyTorch/Ultralytics wheels and your platform.
- Optional: Docker Desktop for the Compose setup.

## Windows setup

Open PowerShell in the project folder. Create the backend environment and install its requirements:

```powershell
cd backend
py -3.12 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
pip install -r requirements.txt
Copy-Item .env.example .env
uvicorn app.main:app --reload
```

If Python 3.12 is not installed, use an installed version supported by PyTorch and replace `py -3.12` with its launcher command. The default `yolov8n.pt` may be downloaded automatically by Ultralytics from its official assets when online. For offline setup, obtain the exact `yolov8n.pt` weights from the [official Ultralytics assets releases](https://github.com/ultralytics/assets/releases), verify the source, and place the file in `backend/models`. Never load `.pt` files from untrusted sources: PyTorch checkpoint formats can contain serialized objects. Other configured model names must exist locally; only the default official weight is eligible for automatic download. Set `ROADVISION_MODEL_PATH` in `backend/.env` to the local filename or path. The default COCO model recognizes common road classes such as cars, trucks, buses, motorcycles, bicycles, people, traffic lights, and stop signs; it is not a specialized road-sign model.

Ultralytics software and trained models are offered under AGPL-3.0 or an applicable commercial license. Review the [current Ultralytics license terms](https://www.ultralytics.com/license) before distribution or deployment; proprietary or commercial use may require an Enterprise license. This note is informational, not legal advice.

In a second PowerShell window, install and start the frontend:

```powershell
cd frontend
Copy-Item .env.example .env
npm install
npm run dev
```

Open the app at <http://localhost:5173>. The API is at <http://127.0.0.1:8000>; interactive API documentation is at <http://127.0.0.1:8000/docs>.

## Use the application

1. Confirm **API connected** in the dashboard header. The settings page reports whether Ultralytics is installed and whether the configured weights are present.
2. For an image, open **Image detection**, select or drop a supported image, choose a threshold and model, and run detection. Compare the original and annotated result, then download the output or CSV.
3. For a video, open **Video analysis**, select a supported clip, configure sampling and tracking, and start the background job. The page polls job progress and offers the annotated video and CSV when complete.
4. Review real stored job results in **Detection history** and **Traffic analytics**. Video class totals are frame detections; tracked-object totals are reported separately.
5. Use **Settings** to change confidence, upload size, inspect model status, and remove completed or failed jobs past the retention period.

## Environment configuration

Copy `backend/.env.example` to `backend/.env`. Existing process environment variables take precedence over this file.

| Variable | Default | Purpose |
| --- | --- | --- |
| `ROADVISION_DATA_DIR` | `backend/data` | SQLite database, uploads, and generated results |
| `ROADVISION_MODEL_PATH` | `yolov8n.pt` | Default Ultralytics model name or local path |
| `ROADVISION_DEVICE` | `auto` | Prefer CUDA device 0 when available; `cpu` forces CPU; a numeric value selects a CUDA device index |
| `ROADVISION_IMAGE_SIZE` | `640` | Inference image size, clamped to 320–1280 pixels |
| `ROADVISION_MAX_UPLOAD_MB` | `250` | Initial maximum media upload; can also be changed in Settings |
| `ROADVISION_VIDEO_WORKERS` | `1` | Concurrent background video jobs, capped at four |
| `ROADVISION_CORS_ORIGINS` | Vite localhost origins | Allowed browser origins |
| `ROADVISION_RETENTION_DAYS` | `30` | Age before completed/failed jobs become cleanup eligible |
| `VITE_API_URL` | `http://127.0.0.1:8000/api` | Frontend API base URL |

## Docker Compose

From the project root, run `docker compose up --build`. The UI is served on <http://localhost:5173> and the API on <http://localhost:8000>. Compose mounts `backend/data` and `backend/models` from the workspace. The first inference may download the default official weight into the mounted `backend/models` folder; provide network access or preload a compatible weight there for offline inference.

## API and architecture

See [API reference](docs/API.md) and [architecture](docs/ARCHITECTURE.md). Backend setup details are in [docs/SETUP.md](docs/SETUP.md).

## Validation

```powershell
cd backend
pytest
cd ..\frontend
npm run build
```

The automated backend tests cover SQLite job aggregation, track summaries, upload signatures, basic API behavior, and inference argument wiring using an explicitly mocked model. They do not verify real predictions. Actual inference requires installed compatible Ultralytics/PyTorch packages and trusted model weights; only a real local run can confirm model initialization and detections.

## Limitations

- Model predictions depend on the selected weights and input quality. Rain, fog, darkness, occlusion, motion blur, and unusual camera angles can reduce reliability.
- COCO pretrained weights do not provide trained road-sign recognition unless the selected model was separately trained for it.
- Track IDs and trajectories are video-frame observations in pixel coordinates. They do not establish physical speed or distance.
- Video processing is CPU/GPU dependent. Sampling fewer frames reduces work but can miss short-lived objects.
- Real-ESRGAN is only reported as available when compatible software and local weights exist; this project does not claim enhanced detection accuracy.
- Authentication is optional for local development and can be enabled for public hosting with `ROADVISION_AUTH_REQUIRED` and the credentials described in [docs/deployment.md](docs/deployment.md). The hosted setup uses one shared login, not individual accounts.
- Ultralytics model and software licensing depends on use and distribution; review the applicable AGPL-3.0 or Enterprise terms before commercial or proprietary deployment.

## GitHub

Initialize a repository in this folder, review `.gitignore`, and keep model weights, generated media, local `.env` files, and SQLite data out of commits. Add your remote and push your chosen branch using your standard Git workflow.
