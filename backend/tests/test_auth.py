from fastapi.testclient import TestClient

from app import config
from app.main import app
from app.security import create_access_token, verify_access_token


def test_protected_api_requires_login(isolated_store, monkeypatch):
    monkeypatch.setattr(config, "AUTH_ENABLED", True)
    monkeypatch.setattr(config, "AUTH_USERNAME", "roadvision-user")
    monkeypatch.setattr(config, "AUTH_PASSWORD", "a-strong-test-password")
    monkeypatch.setattr(config, "AUTH_SECRET", "test-secret-with-at-least-32-bytes-long")

    with TestClient(app) as client:
        assert client.get("/api/auth/status").json() == {"enabled": True}
        assert client.get("/api/jobs").status_code == 401
        assert client.get("/api/auth/session").status_code == 401

        rejected = client.post(
            "/api/auth/login",
            json={"username": "roadvision-user", "password": "incorrect-password"},
        )
        assert rejected.status_code == 401

        response = client.post(
            "/api/auth/login",
            json={"username": "roadvision-user", "password": "a-strong-test-password"},
        )
        assert response.status_code == 200
        token = response.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}
        assert client.get("/api/auth/session", headers=headers).json() == {"authenticated": True}
        assert client.get("/api/jobs", headers=headers).status_code == 200


def test_access_tokens_reject_tampering(monkeypatch):
    monkeypatch.setattr(config, "AUTH_ENABLED", True)
    monkeypatch.setattr(config, "AUTH_USERNAME", "roadvision-user")
    monkeypatch.setattr(config, "AUTH_SECRET", "test-secret-with-at-least-32-bytes-long")
    token = create_access_token()

    assert verify_access_token(token)
    assert not verify_access_token(f"{token}x")
