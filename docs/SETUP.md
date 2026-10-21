# Setup

## Windows PowerShell

Backend terminal:

```powershell
cd backend
py -3.12 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
pip install -r requirements.txt
Copy-Item .env.example .env
uvicorn app.main:app --reload
```

Frontend terminal:

```powershell
cd frontend
Copy-Item .env.example .env
npm install
npm run dev
```

Open `http://localhost:5173`. The backend listens on `http://127.0.0.1:8000`, with Swagger at `http://127.0.0.1:8000/docs`. Use Node.js 20.19+ or 22.12+ for Vite.

Use Python 3.12 when available for current PyTorch wheel compatibility. If using another supported Python, create the virtual environment with that version. Install a compatible PyTorch/Ultralytics combination for your platform; `pip install -r requirements.txt` installs Ultralytics, but GPU acceleration depends on separately compatible drivers and wheels. CPU inference is used when a compatible GPU is not available.

The backend automatically uses CUDA device 0 when PyTorch reports CUDA available, otherwise CPU. Set `ROADVISION_DEVICE=cpu` to force CPU or a number such as `1` to select another CUDA device. Set `ROADVISION_IMAGE_SIZE` to change the square inference size (default 640; supported range 320–1280). For Windows CUDA, choose the matching command with the official [PyTorch installation selector](https://pytorch.org/get-started/locally/) for the installed Python, CUDA runtime, and driver; do not use a wheel command for a different machine.

## Model weights

The default model name is `yolov8n.pt`. When no matching local file exists, Ultralytics may download that official pretrained weight on first inference into `backend/models`. Other missing model names are rejected rather than passed to an automatic downloader. For offline setup, download `yolov8n.pt` from the [official Ultralytics assets releases](https://github.com/ultralytics/assets/releases) and put it in `backend/models`; configure `ROADVISION_MODEL_PATH=yolov8n.pt`. Local `.pt` files in `backend/models` are listed in Settings and can be selected. Only load weight files from sources you trust; PyTorch checkpoint files can contain serialized Python objects. Do not commit model weights.

Ultralytics software and trained models are offered under AGPL-3.0 or an applicable commercial license. Review the [Ultralytics license terms](https://www.ultralytics.com/license) before distribution or deployment; proprietary or commercial use may require an Enterprise license. This note is informational, not legal advice.

## Storage

By default the API creates `backend/data/roadvision.sqlite3`, plus `uploads` and `results` directories. Set `ROADVISION_DATA_DIR` to move all persistent data to another local directory. The server generates filenames for stored media and results.

## Docker

From the repository root, run `docker compose up --build`. Compose serves the frontend at `http://localhost:5173` and the backend at `http://localhost:8000`. Local backend data and model folders are mounted into the container.
