import pytest

from app import config
from app.database import store


@pytest.fixture
def isolated_store(tmp_path, monkeypatch):
    data_dir = tmp_path / "data"
    monkeypatch.setattr(config, "DATA_DIR", data_dir)
    monkeypatch.setattr(config, "UPLOAD_DIR", data_dir / "uploads")
    monkeypatch.setattr(config, "RESULT_DIR", data_dir / "results")
    monkeypatch.setattr(config, "MODEL_DIR", data_dir / "models")
    monkeypatch.setattr(config, "DB_PATH", data_dir / "roadvision.sqlite3")
    config.ensure_directories()
    store.initialize()
    return store
