import os
from pathlib import Path


APP_DIR = Path(__file__).resolve().parents[1]


def _load_local_environment() -> None:
    env_file = APP_DIR / ".env"
    if not env_file.is_file():
        return
    for line in env_file.read_text(encoding="utf-8").splitlines():
        entry = line.strip()
        if not entry or entry.startswith("#") or "=" not in entry:
            continue
        key, value = entry.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip("\"'"))


_load_local_environment()
DATA_DIR = Path(os.getenv("ROADVISION_DATA_DIR", str(APP_DIR / "data"))).expanduser().resolve()
UPLOAD_DIR = DATA_DIR / "uploads"
RESULT_DIR = DATA_DIR / "results"
MODEL_DIR = Path(os.getenv("ROADVISION_MODEL_DIR", str(APP_DIR / "models"))).expanduser().resolve()
DB_PATH = DATA_DIR / "roadvision.sqlite3"
MODEL_PATH = os.getenv("ROADVISION_MODEL_PATH", "yolov8s.pt").strip()
DEVICE = os.getenv("ROADVISION_DEVICE", "auto").strip().lower()
if DEVICE not in {"auto", "cpu"} and not DEVICE.isdigit():
    raise ValueError("ROADVISION_DEVICE must be 'auto', 'cpu', or a CUDA device index.")
IMAGE_SIZE = max(320, min(1280, int(os.getenv("ROADVISION_IMAGE_SIZE", "960"))))
VIDEO_IMAGE_SIZE = max(320, min(1280, int(os.getenv("ROADVISION_VIDEO_IMAGE_SIZE", "640"))))
MAX_UPLOAD_MB = max(1, int(os.getenv("ROADVISION_MAX_UPLOAD_MB", "250")))
VIDEO_WORKERS = max(1, min(4, int(os.getenv("ROADVISION_VIDEO_WORKERS", "1"))))
RETENTION_DAYS = max(1, int(os.getenv("ROADVISION_RETENTION_DAYS", "30")))
CORS_ORIGINS = [
    origin.strip()
    for origin in os.getenv(
        "ROADVISION_CORS_ORIGINS",
        "http://localhost:5173,http://127.0.0.1:5173",
    ).split(",")
    if origin.strip()
]
AUTH_REQUIRED = os.getenv("ROADVISION_AUTH_REQUIRED", "false").strip().lower() in {"1", "true", "yes", "on"}
AUTH_USERNAME = os.getenv("ROADVISION_AUTH_USERNAME", "").strip()
AUTH_PASSWORD = os.getenv("ROADVISION_AUTH_PASSWORD", "")
AUTH_SECRET = os.getenv("ROADVISION_AUTH_SECRET", "")
_AUTH_VALUES = (AUTH_USERNAME, AUTH_PASSWORD, AUTH_SECRET)
_AUTH_CONFIGURED = all(_AUTH_VALUES)

if any(_AUTH_VALUES) and not _AUTH_CONFIGURED:
    raise RuntimeError("Set ROADVISION_AUTH_USERNAME, ROADVISION_AUTH_PASSWORD, and ROADVISION_AUTH_SECRET together.")
if AUTH_REQUIRED and not _AUTH_CONFIGURED:
    raise RuntimeError("Authentication is required, but its credentials are not fully configured.")
if _AUTH_CONFIGURED and len(AUTH_PASSWORD) < 12:
    raise RuntimeError("ROADVISION_AUTH_PASSWORD must contain at least 12 characters.")
if _AUTH_CONFIGURED and len(AUTH_SECRET.encode("utf-8")) < 32:
    raise RuntimeError("ROADVISION_AUTH_SECRET must contain at least 32 bytes.")
AUTH_ENABLED = _AUTH_CONFIGURED


def ensure_directories() -> None:
    for directory in (DATA_DIR, UPLOAD_DIR, RESULT_DIR, MODEL_DIR):
        directory.mkdir(parents=True, exist_ok=True)
