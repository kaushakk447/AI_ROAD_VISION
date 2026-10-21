import importlib.util
from pathlib import Path

from app import config


def status() -> dict[str, object]:
    package_available = importlib.util.find_spec("realesrgan") is not None
    weights = list((config.MODEL_DIR / "enhancement").glob("*.pth")) if (config.MODEL_DIR / "enhancement").exists() else []
    return {
        "available": False,
        "enabled_by_default": False,
        "message": "Enhancement inference is not configured in this build. This status does not imply detection accuracy improvements.",
        "dependencies_present": package_available and bool(weights),
        "weights": [Path(path).name for path in weights],
    }
