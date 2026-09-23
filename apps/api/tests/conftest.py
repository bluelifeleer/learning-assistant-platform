import os
from collections.abc import Generator
from uuid import uuid4

os.environ.setdefault("ALLOW_REGISTRATION", "true")
os.environ.setdefault("DIGEST_SCHEDULER_ENABLED", "false")

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.config import get_settings
from app.db.base import Base
from app.db.session import get_db
from app.main import create_app
from app.models import entities  # noqa: F401 - register SQLAlchemy models for tests.


@pytest.fixture
def client() -> Generator[TestClient, None, None]:
    engine = create_engine(
        "sqlite+pysqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    TestingSessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)
    Base.metadata.create_all(engine)
    app = create_app()

    def override_get_db() -> Generator[Session, None, None]:
        db = TestingSessionLocal()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()
    Base.metadata.drop_all(engine)


@pytest.fixture(autouse=True)
def isolated_export_dir(tmp_path, monkeypatch) -> Generator[None, None, None]:
    monkeypatch.setenv("EXPORT_DIR", str(tmp_path / "exports"))
    monkeypatch.setenv("SCREENSHOTS_DIR", str(tmp_path / "screenshots"))
    monkeypatch.setenv("NOTE_IMAGES_DIR", str(tmp_path / "note_images"))
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


@pytest.fixture
def auth_headers(client: TestClient) -> dict[str, str]:
    response = client.post(
        "/api/v1/auth/register",
        json={"email": f"user-{uuid4().hex[:8]}@example.com", "password": "secret123", "display_name": "User One"},
    )
    assert response.status_code == 200
    return {"Authorization": f"Bearer {response.json()['token']}"}
