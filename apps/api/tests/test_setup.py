from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.schemas.setup import DatabaseConfigIn, SetupInitializeIn
from app.services.setup import build_database_url, read_setup_status, write_env_file


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
    payload = SetupInitializeIn(
        organization_name="Acme Training",
        admin_email="admin@example.com",
        admin_password="change-me",
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

    write_env_file(env_path, payload)

    content = env_path.read_text(encoding="utf-8")
    env_path.unlink()
    assert "DATABASE_TYPE=mysql" in content
    assert "DATABASE_URL=mysql+pymysql://learn_user:secret@mysql.example.com:3306/learn?charset=utf8mb4" in content
    assert "DEFAULT_ORG_NAME=Acme Training" in content
    assert "DEFAULT_ADMIN_EMAIL=admin@example.com" in content
    assert "DEFAULT_ADMIN_PASSWORD=change-me" in content
    assert "LICENSE_KEY=LIC-123" in content


def test_setup_status_endpoint_is_available(client: TestClient) -> None:
    response = client.get("/api/v1/setup/status")

    assert response.status_code == 200
    assert "installed" in response.json()


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
