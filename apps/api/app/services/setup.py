from pathlib import Path
from urllib.parse import quote

from sqlalchemy import create_engine, inspect
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.db.base import Base
from app.models.entities import Membership, Organization, User
from app.schemas.setup import DatabaseConfigIn, DatabaseTestOut, SetupInitializeIn, SetupStatusOut

REQUIRED_TABLES = {
    "organizations",
    "users",
    "memberships",
    "api_tokens",
    "sites",
    "courses",
    "chapters",
    "video_sessions",
    "timeline_events",
    "transcript_segments",
    "notes",
    "exports",
    "audit_logs",
}


def project_root() -> Path:
    return Path(__file__).resolve().parents[4]


def default_env_path() -> Path:
    return project_root() / ".env"


def build_database_url(config: DatabaseConfigIn) -> str:
    username = quote(config.username, safe="")
    password = quote(config.password, safe="")
    database = quote(config.database, safe="")
    host = config.host.strip()
    if config.database_type == "postgresql":
        return f"postgresql+psycopg://{username}:{password}@{host}:{config.port}/{database}"
    if config.database_type == "mysql":
        return f"mysql+pymysql://{username}:{password}@{host}:{config.port}/{database}?charset=utf8mb4"
    raise ValueError(f"Unsupported database type: {config.database_type}")


def mask_database_url(url: str) -> str:
    if "://" not in url or "@" not in url:
        return url
    scheme, rest = url.split("://", 1)
    return f"{scheme}://***:***@{rest.split('@', 1)[1]}"


def parse_env(path: Path) -> dict[str, str]:
    if not path.exists():
        return {}
    values: dict[str, str] = {}
    for line in path.read_text(encoding="utf-8").splitlines():
        if not line or line.strip().startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        values[key.strip()] = value.strip()
    return values


def test_database_connection(database_url: str) -> DatabaseTestOut:
    try:
        engine = create_engine(database_url, pool_pre_ping=True)
        with engine.connect() as connection:
            connection.exec_driver_sql("SELECT 1")
        return DatabaseTestOut(ok=True, database_url=mask_database_url(database_url))
    except Exception as exc:  # SQLAlchemy wraps DB-driver import and connection errors differently.
        return DatabaseTestOut(ok=False, database_url=mask_database_url(database_url), error=str(exc))


def schema_has_required_tables(database_url: str, required_tables: set[str]) -> tuple[bool, bool, str | None]:
    try:
        engine = create_engine(database_url, pool_pre_ping=True)
        with engine.connect() as connection:
            tables = set(inspect(connection).get_table_names())
        return True, required_tables.issubset(tables), None
    except Exception as exc:
        return False, False, str(exc)


def read_setup_status(env_path: Path | None = None, required_tables: set[str] | None = None) -> SetupStatusOut:
    path = env_path or default_env_path()
    env = parse_env(path)
    required = required_tables or REQUIRED_TABLES
    database_url = env.get("DATABASE_URL", "")
    database_type = env.get("DATABASE_TYPE")

    if not path.exists():
        return SetupStatusOut(
            installed=False,
            env_exists=False,
            database_configured=False,
            database_connected=False,
            schema_initialized=False,
            database_type=None,
            next_step="Create .env with database settings",
        )

    if not database_url:
        return SetupStatusOut(
            installed=False,
            env_exists=True,
            database_configured=False,
            database_connected=False,
            schema_initialized=False,
            database_type=database_type,
            next_step="Configure a remote or local database",
        )

    connected, schema_ready, error = schema_has_required_tables(database_url, required)
    if not connected:
        return SetupStatusOut(
            installed=False,
            env_exists=True,
            database_configured=True,
            database_connected=False,
            schema_initialized=False,
            database_type=database_type,
            next_step="Fix database connection settings",
            error=error,
        )

    if not schema_ready:
        return SetupStatusOut(
            installed=False,
            env_exists=True,
            database_configured=True,
            database_connected=True,
            schema_initialized=False,
            database_type=database_type,
            next_step="Initialize database schema",
        )

    return SetupStatusOut(
        installed=True,
        env_exists=True,
        database_configured=True,
        database_connected=True,
        schema_initialized=True,
        database_type=database_type,
        next_step="Open console",
    )


def write_env_file(env_path: Path, payload: SetupInitializeIn) -> None:
    database_url = build_database_url(payload.database)
    content = "\n".join(
        [
            "APP_ENV=development",
            "API_HOST=127.0.0.1",
            "API_PORT=17890",
            "CONSOLE_PORT=17891",
            f"DATABASE_TYPE={payload.database.database_type}",
            f"DATABASE_URL={database_url}",
            f"DEFAULT_ORG_NAME={payload.organization_name}",
            f"DEFAULT_ADMIN_EMAIL={payload.admin_email}",
            f"DEFAULT_ADMIN_PASSWORD={payload.admin_password}",
            "API_TOKEN_PEPPER=change-me-token-pepper",
            "EXPORT_DIR=exports",
            "",
        ]
    )
    env_path.parent.mkdir(parents=True, exist_ok=True)
    env_path.write_text(content, encoding="utf-8")


def initialize_database(payload: SetupInitializeIn, env_path: Path | None = None) -> SetupStatusOut:
    path = env_path or default_env_path()
    write_env_file(path, payload)
    database_url = build_database_url(payload.database)
    if payload.initialize_schema:
        engine = create_engine(database_url, pool_pre_ping=True)
        Base.metadata.create_all(engine)
        with Session(engine) as session:
            if not session.query(Organization).first():
                organization = Organization(name=payload.organization_name, plan="local", license_status="inactive")
                user = User(email=payload.admin_email, display_name="Administrator", password_hash=payload.admin_password)
                session.add_all([organization, user])
                session.flush()
                session.add(Membership(organization_id=organization.id, user_id=user.id, role="owner"))
                session.commit()
    return read_setup_status(path)
