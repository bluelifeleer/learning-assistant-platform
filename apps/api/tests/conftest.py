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
from app.models.entities import Membership


@pytest.fixture
def engine() -> Generator:
    engine = create_engine(
        "sqlite+pysqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    yield engine
    Base.metadata.drop_all(engine)
    engine.dispose()


@pytest.fixture
def session_factory(engine) -> sessionmaker:
    return sessionmaker(bind=engine, autoflush=False, autocommit=False)


@pytest.fixture
def client(engine, session_factory) -> Generator[TestClient, None, None]:
    app = create_app()

    def override_get_db() -> Generator[Session, None, None]:
        db = session_factory()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    # 使用回环地址作为测试客户端来源,以通过 setup 端点的回环访问校验。
    with TestClient(app, client=("127.0.0.1", 50000)) as test_client:
        yield test_client
    app.dependency_overrides.clear()


@pytest.fixture(autouse=True)
def isolated_export_dir(tmp_path, monkeypatch) -> Generator[None, None, None]:
    monkeypatch.setenv("EXPORT_DIR", str(tmp_path / "exports"))
    monkeypatch.setenv("SCREENSHOTS_DIR", str(tmp_path / "screenshots"))
    monkeypatch.setenv("NOTE_IMAGES_DIR", str(tmp_path / "note_images"))
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


@pytest.fixture
def auth_headers(client: TestClient, session_factory) -> dict[str, str]:
    response = client.post(
        "/api/v1/auth/register",
        json={"email": f"user-{uuid4().hex[:8]}@example.com", "password": "secret123", "display_name": "User One"},
    )
    assert response.status_code == 200
    user_id = response.json()["user"]["id"]
    # 注册用户默认是 member;测试需要 owner 权限访问设置类接口,这里提升为 owner。
    db = session_factory()
    try:
        membership = db.query(Membership).filter(Membership.user_id == user_id).first()
        if membership:
            membership.role = "owner"
            db.commit()
    finally:
        db.close()
    return {"Authorization": f"Bearer {response.json()['token']}"}
