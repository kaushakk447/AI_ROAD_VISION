from fastapi.testclient import TestClient

from app.main import app


def test_health_and_model_status(isolated_store):
    with TestClient(app) as client:
        health = client.get("/api/health")
        model_status = client.get("/api/models")

    assert health.status_code == 200
    assert health.json()["status"] == "ok"
    assert model_status.status_code == 200
    assert "models" in model_status.json()
    assert health.json()["model_ready"] == model_status.json()["ready"]


def test_unknown_job_returns_not_found(isolated_store):
    with TestClient(app) as client:
        response = client.get("/api/jobs/missing")

    assert response.status_code == 404
