import io

import pytest

from app import create_app
from app.config import Config
from app.extensions import db


class TestConfig(Config):
    SQLALCHEMY_DATABASE_URI = "sqlite:///:memory:"


@pytest.fixture()
def app():
    app = create_app(TestConfig)
    with app.app_context():
        db.create_all()
    yield app


@pytest.fixture()
def client(app):
    return app.test_client()


def test_health(client):
    resp = client.get("/api/health")
    assert resp.status_code == 200
    data = resp.get_json()
    assert data["ok"] is True


def test_import_file_enqueues_session(client, monkeypatch):
    # Avoid actually calling Celery in tests
    import celery_app

    monkeypatch.setattr(celery_app.celery, "send_task", lambda *a, **k: None)

    data = {
        "file": (io.BytesIO(b"The Matrix (1999)\nInception (2010)"), "movies.txt"),
        "userId": "test-user",
    }

    resp = client.post("/api/import/file", data=data, content_type="multipart/form-data")
    assert resp.status_code == 200
    payload = resp.get_json()
    assert "importId" in payload
    assert payload["status"] == "pending"
