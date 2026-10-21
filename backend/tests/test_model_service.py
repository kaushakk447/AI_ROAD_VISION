from pathlib import Path
import sys
from types import SimpleNamespace

import pytest

from app import config
from app.services.model_service import ModelService, ModelUnavailable


class RecordingModel:
    def __init__(self):
        self.calls = []

    def predict(self, image, **kwargs):
        self.calls.append((image, kwargs))
        return [object()]


def test_inference_uses_configured_size_and_selected_device(monkeypatch):
    service = ModelService()
    model = RecordingModel()
    service._models[Path(config.MODEL_PATH).name] = model
    monkeypatch.setattr(service, "resolve_model", lambda name: "trusted-test-weights")
    monkeypatch.setattr(service, "_select_device", lambda: "cpu")
    monkeypatch.setattr(config, "IMAGE_SIZE", 512)

    image = object()
    result, selected = service.infer(image, 0.4)

    assert result is not None
    assert selected == Path(config.MODEL_PATH).name
    assert model.calls[0][0] is image
    assert model.calls[0][1]["conf"] == 0.4
    assert model.calls[0][1]["imgsz"] == 512
    assert model.calls[0][1]["device"] == "cpu"


def test_missing_nondefault_weights_are_never_resolved_as_downloads(monkeypatch, tmp_path):
    missing_weights = tmp_path / "untrusted-model.pt"
    monkeypatch.setattr(config, "MODEL_PATH", str(missing_weights))

    with pytest.raises(ModelUnavailable, match="not installed"):
        ModelService().resolve_model(None)


def test_default_weight_download_target_is_models_directory(monkeypatch, tmp_path):
    model_dir = tmp_path / "models"
    monkeypatch.setattr(config, "MODEL_DIR", model_dir)

    for name in ("yolov8n.pt", "yolov8s.pt"):
        monkeypatch.setattr(config, "MODEL_PATH", name)
        assert Path(ModelService().resolve_model(None)) == model_dir / name


def test_only_trusted_pretrained_variants_can_download(monkeypatch, tmp_path):
    monkeypatch.setattr(config, "MODEL_PATH", "yolov8s.pt")
    monkeypatch.setattr(config, "MODEL_DIR", tmp_path / "models")
    service = ModelService()

    assert Path(service.resolve_model("yolov8s.pt")) == tmp_path / "models" / "yolov8s.pt"
    with pytest.raises(ModelUnavailable, match="not installed"):
        service.resolve_model("custom-road-model.pt")


def test_inference_accepts_a_separate_image_size(monkeypatch):
    service = ModelService()
    model = RecordingModel()
    service._models[Path(config.MODEL_PATH).name] = model
    monkeypatch.setattr(service, "resolve_model", lambda name: "trusted-test-weights")
    monkeypatch.setattr(service, "_select_device", lambda: "cpu")
    monkeypatch.setattr(config, "IMAGE_SIZE", 960)

    service.infer(object(), 0.4, image_size=640)

    assert model.calls[0][1]["imgsz"] == 640


def test_model_list_exposes_trusted_higher_accuracy_variant(monkeypatch, tmp_path):
    model_dir = tmp_path / "models"
    model_dir.mkdir()
    (model_dir / "yolov8n.pt").touch()
    monkeypatch.setattr(config, "MODEL_PATH", "yolov8s.pt")
    monkeypatch.setattr(config, "MODEL_DIR", model_dir)
    monkeypatch.setattr("app.services.model_service.importlib.util.find_spec", lambda name: object())

    status = ModelService().list_models()
    variants = {item["name"]: item for item in status["models"]}

    assert variants["yolov8s.pt"]["configured"] is True
    assert variants["yolov8s.pt"]["will_download"] is True
    assert variants["yolov8n.pt"]["available"] is True
    assert status["ready"] is True


def test_model_list_includes_downloadable_weights_when_none_are_installed(monkeypatch, tmp_path):
    monkeypatch.setattr(config, "MODEL_PATH", "yolov8n.pt")
    monkeypatch.setattr(config, "MODEL_DIR", tmp_path / "models")
    monkeypatch.setattr("app.services.model_service.importlib.util.find_spec", lambda name: object())

    status = ModelService().list_models()
    variants = {item["name"]: item for item in status["models"]}

    assert variants["yolov8n.pt"]["configured"] is True
    assert variants["yolov8n.pt"]["will_download"] is True
    assert variants["yolov8s.pt"]["will_download"] is True
    assert status["ready"] is True


def test_auto_device_prefers_cuda_then_falls_back_to_cpu(monkeypatch):
    monkeypatch.setattr(config, "DEVICE", "auto")
    monkeypatch.setitem(sys.modules, "torch", SimpleNamespace(cuda=SimpleNamespace(is_available=lambda: True)))
    assert ModelService()._select_device() == "0"

    monkeypatch.setitem(sys.modules, "torch", SimpleNamespace(cuda=SimpleNamespace(is_available=lambda: False)))
    assert ModelService()._select_device() == "cpu"
