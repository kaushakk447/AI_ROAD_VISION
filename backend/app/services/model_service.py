import importlib.util
import threading
from contextlib import contextmanager
from pathlib import Path
from typing import Any, Iterator

from app import config

TRUSTED_PRETRAINED_WEIGHTS = {"yolov8n.pt", "yolov8s.pt"}


class ModelUnavailable(RuntimeError):
    pass


class ModelService:
    def __init__(self) -> None:
        self._models: dict[str, Any] = {}
        self._lock = threading.RLock()
        self._inference_lock = threading.Lock()
        self._tracking_lock = threading.Lock()
        self._device: str | None = None

    def _select_device(self) -> str:
        if config.DEVICE != "auto":
            return config.DEVICE
        with self._lock:
            if self._device is None:
                try:
                    import torch

                    self._device = "0" if torch.cuda.is_available() else "cpu"
                except Exception:
                    self._device = "cpu"
            return self._device

    def _model_paths(self) -> dict[str, Path]:
        paths = {path.name: path for path in config.MODEL_DIR.glob("*.pt") if path.is_file()}
        configured = Path(config.MODEL_PATH).expanduser()
        if configured.is_file():
            paths[configured.name] = configured.resolve()
        elif not configured.is_absolute() and configured.parent == Path("."):
            paths.setdefault(configured.name, configured)
        return paths

    def list_models(self) -> dict[str, Any]:
        package_available = importlib.util.find_spec("ultralytics") is not None
        paths = self._model_paths()
        configured_name = Path(config.MODEL_PATH).name
        weights_available = any(name == configured_name and path.is_file() for name, path in paths.items())
        models = []
        for name in sorted(set(paths) | TRUSTED_PRETRAINED_WEIGHTS):
            path = paths.get(name, config.MODEL_DIR / name)
            local = path.is_file()
            will_download = package_available and name in TRUSTED_PRETRAINED_WEIGHTS and not local
            models.append(
                {
                    "name": name,
                    "available": local,
                    "configured": name == configured_name,
                    "source": "local" if local else "Ultralytics pretrained weight",
                    "will_download": will_download,
                }
            )
        configured_can_download = (
            package_available
            and configured_name in TRUSTED_PRETRAINED_WEIGHTS
            and not weights_available
        )
        return {
            "default_model": configured_name,
            "ultralytics_available": package_available,
            "models": models,
            "weights_available": weights_available,
            "model_loaded": configured_name in self._models,
            "device": self._select_device() if package_available else "unavailable",
            "image_size": config.IMAGE_SIZE,
            "ready": package_available and (weights_available or configured_can_download),
        }

    def resolve_model(self, name: str | None) -> str:
        selected = name or Path(config.MODEL_PATH).name
        paths = self._model_paths()
        if selected not in paths:
            if selected in TRUSTED_PRETRAINED_WEIGHTS:
                return str(config.MODEL_DIR / selected)
            raise ModelUnavailable(
                "The selected weights are not installed. Place a trusted .pt file in backend/models or configure its local path."
            )
        path = paths[selected]
        if path.is_file():
            return str(path)
        if selected in TRUSTED_PRETRAINED_WEIGHTS:
            return str(config.MODEL_DIR / selected)
        raise ModelUnavailable("The selected model weights are not available on this server.")

    def get(self, name: str | None = None) -> tuple[Any, str]:
        selected = name or Path(config.MODEL_PATH).name
        model_path = self.resolve_model(selected)
        with self._lock:
            if selected not in self._models:
                if importlib.util.find_spec("ultralytics") is None:
                    raise ModelUnavailable("Ultralytics is not installed. Install backend/requirements.txt and restart the API.")
                try:
                    from ultralytics import YOLO

                    self._models[selected] = YOLO(model_path)
                except Exception as error:
                    raise ModelUnavailable(
                        "The model could not be loaded. Check the configured weight path and model download access."
                    ) from error
            return self._models[selected], selected

    def infer(
        self,
        image: Any,
        confidence: float,
        model_name: str | None = None,
        tracking: bool = False,
        tracker: str = "bytetrack.yaml",
        image_size: int | None = None,
    ) -> tuple[Any, str]:
        model, selected = self.get(model_name)
        inference_size = image_size or config.IMAGE_SIZE
        try:
            with self._inference_lock:
                if tracking:
                    result = model.track(
                        image,
                        conf=confidence,
                        imgsz=inference_size,
                        device=self._select_device(),
                        persist=True,
                        tracker=tracker,
                        verbose=False,
                    )[0]
                else:
                    result = model.predict(
                        image,
                        conf=confidence,
                        imgsz=inference_size,
                        device=self._select_device(),
                        verbose=False,
                    )[0]
        except Exception as error:
            raise ModelUnavailable("YOLO inference failed. Verify that the selected weights match this Ultralytics version.") from error
        return result, selected

    def reset_tracking(self, name: str | None = None) -> None:
        model, _ = self.get(name)
        with self._inference_lock:
            predictor = getattr(model, "predictor", None)
            if predictor is not None and hasattr(predictor, "trackers"):
                del predictor.trackers

    @contextmanager
    def tracking_session(self, name: str | None = None) -> Iterator[None]:
        with self._tracking_lock:
            self.reset_tracking(name)
            yield


models = ModelService()
