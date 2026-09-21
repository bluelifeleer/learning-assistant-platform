from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, inspect

from app.schemas.setup import DatabaseConfigIn, SetupInitializeIn, SetupStatusOut
from app.services.setup import build_database_url, read_setup_status, run_migrations, write_env_file


def make_initialize_payload() -> SetupInitializeIn:
    return SetupInitializeIn(
        organization_name="Acme Training",
        admin_email="admin@example.com",
        admin_password="super-secret-123",
        license_key="LIC-123",
        database=DatabaseConfigIn(
            database_type="mysql",
            host="mysql.example.com",
            port=3306,
            database="learn",
            username="learn_user",
            password="secret",
        ),
    )


def test_build_database_url_supports_remote_postgresql() -> None:
    payload = DatabaseConfigIn(
        database_type="postgresql",
        host="db.example.com",
        port=5432,
        database="learn",
        username="learn_user",
        password="secret pass",
    )

    assert build_database_url(payload) == "postgresql+psycopg://learn_user:secret%20pass@db.example.com:5432/learn"


def test_build_database_url_supports_remote_mysql() -> None:
    payload = DatabaseConfigIn(
        database_type="mysql",
        host="192.168.1.20",
        port=3306,
        database="learn",
        username="learn_user",
        password="secret",
    )

    assert build_database_url(payload) == "mysql+pymysql://learn_user:secret@192.168.1.20:3306/learn?charset=utf8mb4"


def test_setup_status_reports_missing_env() -> None:
    env_path = Path("tests/.setup-missing.env")
    if env_path.exists():
        env_path.unlink()
    status = read_setup_status(env_path, required_tables={"organizations"})

    assert status.installed is False
    assert status.env_exists is False
    assert status.database_configured is False
    assert "Create .env" in status.next_step


def test_write_env_file_persists_remote_database_config() -> None:
    env_path = Path("tests/.setup-test.env")
    if env_path.exists():
        env_path.unlink()
    payload = make_initialize_payload()

    write_env_file(env_path, payload)

    content = env_path.read_text(encoding="utf-8")
    env_path.unlink()
    assert "DATABASE_TYPE=mysql" in content
    assert "DATABASE_URL=mysql+pymysql://learn_user:secret@mysql.example.com:3306/learn?charset=utf8mb4" in content
    assert "DEFAULT_ORG_NAME=Acme Training" in content


def test_write_env_file_generates_random_pepper_and_omits_secrets() -> None:
    first_path = Path("tests/.setup-pepper-1.env")
    second_path = Path("tests/.setup-pepper-2.env")
    payload = make_initialize_payload()

    write_env_file(first_path, payload)
    write_env_file(second_path, payload)

    first = first_path.read_text(encoding="utf-8")
    second = second_path.read_text(encoding="utf-8")
    first_path.unlink()
    second_path.unlink()
    first_pepper = next(line for line in first.splitlines() if line.startswith("API_TOKEN_PEPPER="))
    second_pepper = next(line for line in second.splitlines() if line.startswith("API_TOKEN_PEPPER="))
    assert first_pepper != "API_TOKEN_PEPPER=change-me-token-pepper"
    assert first_pepper != second_pepper
    assert "super-secret-123" not in first
    assert "DEFAULT_ADMIN_PASSWORD" not in first
    assert "LIC-123" not in first
    assert "LICENSE_KEY" not in first


def test_run_migrations_creates_schema_and_is_idempotent(tmp_path) -> None:
    database_url = f"sqlite+pysqlite:///{tmp_path / 'setup.db'}"

    run_migrations(database_url)
    run_migrations(database_url)

    engine = create_engine(database_url)
    with engine.connect() as connection:
        tables = set(inspect(connection).get_table_names())
    assert "alembic_version" in tables
    assert "video_capture_events" in tables
    assert {"organizations", "users", "notes", "exports", "video_sessions"}.issubset(tables)


def test_setup_status_endpoint_is_available(client: TestClient) -> None:
    response = client.get("/api/v1/setup/status")

    assert response.status_code == 200
    assert "installed" in response.json()


def installed_status() -> SetupStatusOut:
    return SetupStatusOut(
        installed=True,
        env_exists=True,
        database_configured=True,
        database_connected=True,
        schema_initialized=True,
        database_type="postgresql",
        next_step="Open console",
    )


def test_setup_initialize_returns_409_when_already_installed(client: TestClient, monkeypatch) -> None:
    monkeypatch.setattr("app.routes.setup.read_setup_status", lambda: installed_status())

    response = client.post("/api/v1/setup/initialize", json=make_initialize_payload().model_dump())

    assert response.status_code == 409


def test_setup_test_database_returns_409_when_already_installed(client: TestClient, monkeypatch) -> None:
    monkeypatch.setattr("app.routes.setup.read_setup_status", lambda: installed_status())

    response = client.post("/api/v1/setup/test-database", json=make_initialize_payload().database.model_dump())

    assert response.status_code == 409


def test_database_type_rejects_unknown_value() -> None:
    with pytest.raises(ValueError):
        DatabaseConfigIn(
            database_type="sqlite",
            host="localhost",
            port=0,
            database="learn",
            username="learn",
            password="secret",
        )


def test_write_env_file_preserves_existing_pepper_on_reinitialize() -> None:
    env_path = Path("tests/.setup-pepper-keep.env")
    if env_path.exists():
        env_path.unlink()
    payload = make_initialize_payload()

    write_env_file(env_path, payload)
    first = env_path.read_text(encoding="utf-8")
    first_pepper = next(line for line in first.splitlines() if line.startswith("API_TOKEN_PEPPER="))

    write_env_file(env_path, payload)
    second = env_path.read_text(encoding="utf-8")
    env_path.unlink()
    second_pepper = next(line for line in second.splitlines() if line.startswith("API_TOKEN_PEPPER="))
    assert second_pepper == first_pepper
