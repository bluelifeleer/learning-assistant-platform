# Learning Assistant Platform Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a commercial-ready, adapter-based learning content capture platform with a Chrome extension, Python FastAPI service, PostgreSQL storage, and React control console.

**Architecture:** The project is a monorepo at `C:\Users\HUAWEI\www\learning-assistant-platform`. The Chrome extension captures user-visible learning context through site adapters and sends only learning-assistant events to the FastAPI service; the service persists normalized data in PostgreSQL and exposes versioned APIs for the React console. The implementation preserves the compliance boundary: record, remind, highlight, and export only.

**Tech Stack:** Python 3.11+, FastAPI, SQLAlchemy 2, Alembic, PostgreSQL, pytest, Vite, React, TypeScript, Vitest, Chrome Extension Manifest V3, PowerShell scripts.

---

## Target Project Path

Create the working project at:

`C:\Users\HUAWEI\www\learning-assistant-platform`

The current Codex thread directory keeps the design and plan documents only. Writing to `C:\Users\HUAWEI\www` requires filesystem approval during execution.

## File Structure

```text
C:\Users\HUAWEI\www\learning-assistant-platform
  README.md
  .gitignore
  .env.example
  package.json
  pnpm-workspace.yaml
  apps/
    api/
      pyproject.toml
      alembic.ini
      app/
        main.py
        core/config.py
        core/security.py
        core/deps.py
        db/base.py
        db/session.py
        models/entities.py
        schemas/capture.py
        schemas/common.py
        routes/health.py
        routes/auth.py
        routes/capture.py
        routes/courses.py
        routes/exports.py
        services/auth_tokens.py
        services/capture.py
        services/exports.py
        exporters/markdown.py
        exporters/json_export.py
      alembic/versions/0001_initial.py
      tests/conftest.py
      tests/test_health.py
      tests/test_auth_tokens.py
      tests/test_capture.py
      tests/test_exports.py
    console/
      package.json
      index.html
      src/main.tsx
      src/App.tsx
      src/api/client.ts
      src/pages/Dashboard.tsx
      src/pages/Courses.tsx
      src/pages/CourseDetail.tsx
      src/pages/Exports.tsx
      src/pages/Settings.tsx
      src/styles.css
      src/App.test.tsx
    extension/
      package.json
      manifest.json
      src/background.ts
      src/content.ts
      src/capture/client.ts
      src/adapters/types.ts
      src/adapters/registry.ts
      src/adapters/genericVideo.ts
      src/adapters/genericDomCourse.ts
      src/adapters/wencaiSchool.ts
      src/ui/overlay.ts
      src/safety/guardrails.ts
      src/__tests__/adapters.test.ts
      src/__tests__/guardrails.test.ts
  docs/
    superpowers/specs/2026-07-05-learning-assistant-platform-design.md
    superpowers/plans/2026-07-05-learning-assistant-platform.md
  scripts/
    dev.ps1
    db.ps1
    open-learning-site.ps1
```

## Task 1: Create Monorepo Shell

**Files:**
- Create under `C:\Users\HUAWEI\www\learning-assistant-platform`: all root folders and baseline config files.
- Copy from current workspace: `docs/superpowers/specs/2026-07-05-learning-assistant-platform-design.md`
- Copy from current workspace: `docs/superpowers/plans/2026-07-05-learning-assistant-platform.md`

- [ ] **Step 1: Create target directory**

Run in PowerShell with approval because the path is outside the current writable root:

```powershell
New-Item -ItemType Directory -Force -Path C:\Users\HUAWEI\www\learning-assistant-platform
```

Expected: directory exists.

- [ ] **Step 2: Initialize git**

Run:

```powershell
Set-Location C:\Users\HUAWEI\www\learning-assistant-platform
git init
```

Expected: `.git` directory exists.

- [ ] **Step 3: Create root package and workspace files**

Create `package.json`:

```json
{
  "name": "learning-assistant-platform",
  "private": true,
  "version": "0.1.0",
  "scripts": {
    "test": "pnpm --recursive test",
    "test:extension": "pnpm --filter @learn-assistant/extension test",
    "test:console": "pnpm --filter @learn-assistant/console test",
    "build": "pnpm --recursive build",
    "build:extension": "pnpm --filter @learn-assistant/extension build",
    "build:console": "pnpm --filter @learn-assistant/console build"
  },
  "packageManager": "pnpm@9.12.3"
}
```

Create `pnpm-workspace.yaml`:

```yaml
packages:
  - apps/console
  - apps/extension
```

Create `.gitignore`:

```gitignore
.env
.venv/
__pycache__/
.pytest_cache/
.mypy_cache/
node_modules/
dist/
build/
.vite/
coverage/
exports/
*.pyc
```

Create `.env.example`:

```env
APP_ENV=development
API_HOST=127.0.0.1
API_PORT=17890
CONSOLE_PORT=17891
DATABASE_URL=postgresql+psycopg://learn_assistant:learn_assistant@127.0.0.1:5432/learn_assistant
DEFAULT_ORG_NAME=Local Workspace
DEFAULT_ADMIN_EMAIL=admin@example.local
DEFAULT_ADMIN_PASSWORD=change-me-local
API_TOKEN_PEPPER=change-me-token-pepper
EXPORT_DIR=exports
```

- [ ] **Step 4: Commit root shell**

Run:

```powershell
git add package.json pnpm-workspace.yaml .gitignore .env.example docs
git commit -m "chore: initialize learning assistant monorepo"
```

Expected: commit succeeds.

## Task 2: FastAPI Health and Configuration

**Files:**
- Create: `apps/api/pyproject.toml`
- Create: `apps/api/app/main.py`
- Create: `apps/api/app/core/config.py`
- Create: `apps/api/app/routes/health.py`
- Create: `apps/api/tests/conftest.py`
- Create: `apps/api/tests/test_health.py`

- [ ] **Step 1: Write failing health test**

Create `apps/api/tests/test_health.py`:

```python
from fastapi.testclient import TestClient


def test_health_returns_service_status(client: TestClient) -> None:
    response = client.get("/api/v1/health")

    assert response.status_code == 200
    assert response.json() == {
        "status": "ok",
        "service": "learning-assistant-api",
        "version": "0.1.0",
    }
```

Create `apps/api/tests/conftest.py`:

```python
from collections.abc import Generator

from fastapi.testclient import TestClient

from app.main import create_app


def client() -> Generator[TestClient, None, None]:
    with TestClient(create_app()) as test_client:
        yield test_client
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
Set-Location C:\Users\HUAWEI\www\learning-assistant-platform\apps\api
python -m pytest tests\test_health.py -q
```

Expected: FAIL because `app.main` is not implemented.

- [ ] **Step 3: Add API package configuration**

Create `apps/api/pyproject.toml`:

```toml
[project]
name = "learning-assistant-api"
version = "0.1.0"
requires-python = ">=3.11"
dependencies = [
  "alembic>=1.13.3",
  "fastapi>=0.115.0",
  "passlib[bcrypt]>=1.7.4",
  "psycopg[binary]>=3.2.1",
  "pydantic-settings>=2.5.2",
  "python-multipart>=0.0.9",
  "sqlalchemy>=2.0.35",
  "uvicorn[standard]>=0.30.6"
]

[project.optional-dependencies]
dev = [
  "httpx>=0.27.2",
  "pytest>=8.3.3",
  "pytest-asyncio>=0.24.0"
]

[tool.pytest.ini_options]
pythonpath = ["."]
testpaths = ["tests"]
```

Create `apps/api/app/core/config.py`:

```python
from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_env: str = "development"
    api_host: str = "127.0.0.1"
    api_port: int = 17890
    database_url: str = "postgresql+psycopg://learn_assistant:learn_assistant@127.0.0.1:5432/learn_assistant"
    default_org_name: str = "Local Workspace"
    api_token_pepper: str = "change-me-token-pepper"
    export_dir: str = "exports"

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


@lru_cache
def get_settings() -> Settings:
    return Settings()
```

Create `apps/api/app/routes/health.py`:

```python
from fastapi import APIRouter

router = APIRouter(prefix="/health", tags=["health"])


@router.get("")
def health() -> dict[str, str]:
    return {
        "status": "ok",
        "service": "learning-assistant-api",
        "version": "0.1.0",
    }
```

Create `apps/api/app/main.py`:

```python
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routes import health


def create_app() -> FastAPI:
    app = FastAPI(title="Learning Assistant API", version="0.1.0")
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["http://127.0.0.1:17891", "http://localhost:17891"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.include_router(health.router, prefix="/api/v1")
    return app


app = create_app()
```

Create empty package files:

```text
apps/api/app/__init__.py
apps/api/app/core/__init__.py
apps/api/app/routes/__init__.py
```

- [ ] **Step 4: Run health test**

Run:

```powershell
python -m pytest tests\test_health.py -q
```

Expected: PASS.

- [ ] **Step 5: Commit**

Run:

```powershell
git add apps\api
git commit -m "feat(api): add FastAPI health endpoint"
```

Expected: commit succeeds.

## Task 3: PostgreSQL Models and Migration

**Files:**
- Create: `apps/api/app/db/base.py`
- Create: `apps/api/app/db/session.py`
- Create: `apps/api/app/models/entities.py`
- Create: `apps/api/alembic.ini`
- Create: `apps/api/alembic/env.py`
- Create: `apps/api/alembic/versions/0001_initial.py`
- Create: `apps/api/tests/test_models.py`

- [ ] **Step 1: Write model metadata test**

Create `apps/api/tests/test_models.py`:

```python
from app.db.base import Base
from app.models import entities


def test_expected_tables_are_registered() -> None:
    assert entities.Organization.__tablename__ == "organizations"
    table_names = set(Base.metadata.tables)

    assert {
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
    }.issubset(table_names)
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
python -m pytest tests\test_models.py -q
```

Expected: FAIL because database models are absent.

- [ ] **Step 3: Add SQLAlchemy base and session**

Create `apps/api/app/db/base.py`:

```python
from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    pass
```

Create `apps/api/app/db/session.py`:

```python
from collections.abc import Generator

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import get_settings

engine = create_engine(get_settings().database_url, pool_pre_ping=True)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
```

- [ ] **Step 4: Add ORM entities**

Create `apps/api/app/models/entities.py`:

```python
from datetime import datetime
from uuid import uuid4

from sqlalchemy import DateTime, ForeignKey, Integer, Numeric, String, Text, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


def new_uuid() -> str:
    return str(uuid4())


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Organization(Base, TimestampMixin):
    __tablename__ = "organizations"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=new_uuid)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    plan: Mapped[str] = mapped_column(String(50), default="local")
    license_key: Mapped[str | None] = mapped_column(String(200))
    license_status: Mapped[str] = mapped_column(String(50), default="inactive")


class User(Base, TimestampMixin):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=new_uuid)
    email: Mapped[str] = mapped_column(String(320), nullable=False, unique=True)
    display_name: Mapped[str] = mapped_column(String(120), nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)


class Membership(Base):
    __tablename__ = "memberships"
    __table_args__ = (UniqueConstraint("organization_id", "user_id", name="uq_membership_org_user"),)

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=new_uuid)
    organization_id: Mapped[str] = mapped_column(ForeignKey("organizations.id"), nullable=False)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), nullable=False)
    role: Mapped[str] = mapped_column(String(50), nullable=False)


class ApiToken(Base):
    __tablename__ = "api_tokens"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=new_uuid)
    organization_id: Mapped[str] = mapped_column(ForeignKey("organizations.id"), nullable=False)
    user_id: Mapped[str | None] = mapped_column(ForeignKey("users.id"))
    token_hash: Mapped[str] = mapped_column(String(255), nullable=False, unique=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    last_used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class Site(Base):
    __tablename__ = "sites"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=new_uuid)
    adapter_id: Mapped[str] = mapped_column(String(120), nullable=False, unique=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    host_patterns: Mapped[dict] = mapped_column(JSONB, default=dict)
    status: Mapped[str] = mapped_column(String(50), default="enabled")


class Course(Base, TimestampMixin):
    __tablename__ = "courses"
    __table_args__ = (UniqueConstraint("organization_id", "site_id", "external_course_id", name="uq_course_external"),)

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=new_uuid)
    organization_id: Mapped[str] = mapped_column(ForeignKey("organizations.id"), nullable=False)
    site_id: Mapped[str] = mapped_column(ForeignKey("sites.id"), nullable=False)
    external_course_id: Mapped[str] = mapped_column(String(255), nullable=False)
    title: Mapped[str] = mapped_column(String(500), nullable=False)
    term: Mapped[str | None] = mapped_column(String(120))
    extra: Mapped[dict] = mapped_column("metadata", JSONB, default=dict)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    chapters: Mapped[list["Chapter"]] = relationship(back_populates="course")


class Chapter(Base):
    __tablename__ = "chapters"
    __table_args__ = (UniqueConstraint("course_id", "external_chapter_id", name="uq_chapter_external"),)

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=new_uuid)
    course_id: Mapped[str] = mapped_column(ForeignKey("courses.id"), nullable=False)
    parent_id: Mapped[str | None] = mapped_column(ForeignKey("chapters.id"))
    external_chapter_id: Mapped[str] = mapped_column(String(255), nullable=False)
    title: Mapped[str] = mapped_column(String(500), nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    duration_seconds: Mapped[int | None] = mapped_column(Integer)
    extra: Mapped[dict] = mapped_column("metadata", JSONB, default=dict)
    course: Mapped[Course] = relationship(back_populates="chapters")


class VideoSession(Base):
    __tablename__ = "video_sessions"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=new_uuid)
    course_id: Mapped[str] = mapped_column(ForeignKey("courses.id"), nullable=False)
    chapter_id: Mapped[str] = mapped_column(ForeignKey("chapters.id"), nullable=False)
    user_id: Mapped[str | None] = mapped_column(ForeignKey("users.id"))
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    duration_watched_seconds: Mapped[int] = mapped_column(Integer, default=0)
    source_url: Mapped[str] = mapped_column(Text, nullable=False)


class TimelineEvent(Base, TimestampMixin):
    __tablename__ = "timeline_events"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=new_uuid)
    video_session_id: Mapped[str] = mapped_column(ForeignKey("video_sessions.id"), nullable=False)
    event_type: Mapped[str] = mapped_column(String(80), nullable=False)
    video_time_seconds: Mapped[float | None] = mapped_column(Numeric(10, 3))
    payload: Mapped[dict] = mapped_column(JSONB, default=dict)


class TranscriptSegment(Base, TimestampMixin):
    __tablename__ = "transcript_segments"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=new_uuid)
    course_id: Mapped[str] = mapped_column(ForeignKey("courses.id"), nullable=False)
    chapter_id: Mapped[str] = mapped_column(ForeignKey("chapters.id"), nullable=False)
    video_session_id: Mapped[str | None] = mapped_column(ForeignKey("video_sessions.id"))
    start_seconds: Mapped[float | None] = mapped_column(Numeric(10, 3))
    end_seconds: Mapped[float | None] = mapped_column(Numeric(10, 3))
    text: Mapped[str] = mapped_column(Text, nullable=False)
    source: Mapped[str] = mapped_column(String(80), nullable=False)


class Note(Base, TimestampMixin):
    __tablename__ = "notes"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=new_uuid)
    course_id: Mapped[str] = mapped_column(ForeignKey("courses.id"), nullable=False)
    chapter_id: Mapped[str | None] = mapped_column(ForeignKey("chapters.id"))
    user_id: Mapped[str | None] = mapped_column(ForeignKey("users.id"))
    video_time_seconds: Mapped[float | None] = mapped_column(Numeric(10, 3))
    content: Mapped[str] = mapped_column(Text, nullable=False)


class Export(Base, TimestampMixin):
    __tablename__ = "exports"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=new_uuid)
    organization_id: Mapped[str] = mapped_column(ForeignKey("organizations.id"), nullable=False)
    user_id: Mapped[str | None] = mapped_column(ForeignKey("users.id"))
    course_id: Mapped[str | None] = mapped_column(ForeignKey("courses.id"))
    format: Mapped[str] = mapped_column(String(40), nullable=False)
    status: Mapped[str] = mapped_column(String(40), nullable=False)
    file_path: Mapped[str | None] = mapped_column(Text)


class AuditLog(Base, TimestampMixin):
    __tablename__ = "audit_logs"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=new_uuid)
    organization_id: Mapped[str | None] = mapped_column(ForeignKey("organizations.id"))
    user_id: Mapped[str | None] = mapped_column(ForeignKey("users.id"))
    action: Mapped[str] = mapped_column(String(120), nullable=False)
    resource_type: Mapped[str | None] = mapped_column(String(120))
    resource_id: Mapped[str | None] = mapped_column(String(120))
    payload: Mapped[dict] = mapped_column(JSONB, default=dict)
```

Create `apps/api/app/models/__init__.py`:

```python
from app.models.entities import (
    ApiToken,
    AuditLog,
    Chapter,
    Course,
    Export,
    Membership,
    Note,
    Organization,
    Site,
    TimelineEvent,
    TranscriptSegment,
    User,
    VideoSession,
)

__all__ = [
    "ApiToken",
    "AuditLog",
    "Chapter",
    "Course",
    "Export",
    "Membership",
    "Note",
    "Organization",
    "Site",
    "TimelineEvent",
    "TranscriptSegment",
    "User",
    "VideoSession",
]
```

- [ ] **Step 5: Add Alembic migration**

Create `apps/api/alembic/versions/0001_initial.py` with equivalent `op.create_table` definitions for the ORM entities above. Use PostgreSQL `UUID`, `JSONB`, foreign keys, and the unique constraints named in the models.

- [ ] **Step 6: Run metadata test**

Run:

```powershell
python -m pytest tests\test_models.py -q
```

Expected: PASS.

- [ ] **Step 7: Commit**

Run:

```powershell
git add apps\api
git commit -m "feat(api): add PostgreSQL data model"
```

Expected: commit succeeds.

## Task 4: API Token Authentication

**Files:**
- Create: `apps/api/app/core/security.py`
- Create: `apps/api/app/core/deps.py`
- Create: `apps/api/app/services/auth_tokens.py`
- Create: `apps/api/app/routes/auth.py`
- Modify: `apps/api/app/main.py`
- Create: `apps/api/tests/test_auth_tokens.py`

- [ ] **Step 1: Write token hashing tests**

Create `apps/api/tests/test_auth_tokens.py`:

```python
from app.services.auth_tokens import create_plain_token, hash_token, verify_token


def test_token_hash_verification() -> None:
    token = create_plain_token()
    digest = hash_token(token, pepper="pepper")

    assert token.startswith("la_")
    assert verify_token(token, digest, pepper="pepper") is True
    assert verify_token(token + "x", digest, pepper="pepper") is False
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
python -m pytest tests\test_auth_tokens.py -q
```

Expected: FAIL because `app.services.auth_tokens` is absent.

- [ ] **Step 3: Implement token helpers**

Create `apps/api/app/services/auth_tokens.py`:

```python
import hashlib
import hmac
import secrets


def create_plain_token() -> str:
    return "la_" + secrets.token_urlsafe(32)


def hash_token(token: str, pepper: str) -> str:
    return hmac.new(pepper.encode("utf-8"), token.encode("utf-8"), hashlib.sha256).hexdigest()


def verify_token(token: str, digest: str, pepper: str) -> bool:
    expected = hash_token(token, pepper)
    return hmac.compare_digest(expected, digest)
```

Create `apps/api/app/services/__init__.py`:

```python
```

- [ ] **Step 4: Run token helper test**

Run:

```powershell
python -m pytest tests\test_auth_tokens.py -q
```

Expected: PASS.

- [ ] **Step 5: Commit**

Run:

```powershell
git add apps\api
git commit -m "feat(api): add API token hashing"
```

Expected: commit succeeds.

## Task 5: Capture Schemas and Services

**Files:**
- Create: `apps/api/app/schemas/common.py`
- Create: `apps/api/app/schemas/capture.py`
- Create: `apps/api/app/services/capture.py`
- Create: `apps/api/app/routes/capture.py`
- Modify: `apps/api/app/main.py`
- Create: `apps/api/tests/test_capture.py`

- [ ] **Step 1: Write schema tests**

Create `apps/api/tests/test_capture.py`:

```python
from app.schemas.capture import CourseSnapshotIn, TranscriptSegmentIn, VideoEventIn


def test_course_snapshot_payload_accepts_chapter_tree() -> None:
    payload = CourseSnapshotIn(
        adapter_id="wencai-school",
        site_url="https://learning.wencaischool.net/openlearning/console/",
        external_course_id="course-1",
        course_title="习近平新时代中国特色社会主义思想概论",
        term="第3学期",
        chapters=[
            {
                "external_chapter_id": "1",
                "title": "第1章",
                "sort_order": 1,
                "children": [
                    {
                        "external_chapter_id": "1.1",
                        "title": "1.1这门课程的主要内容",
                        "sort_order": 1,
                        "children": [],
                    }
                ],
            }
        ],
    )

    assert payload.chapters[0].children[0].title == "1.1这门课程的主要内容"


def test_video_event_payload_is_limited_to_assistant_events() -> None:
    event = VideoEventIn(
        session_id="session-1",
        event_type="ended",
        video_time_seconds=120.5,
        payload={"message": "remind_user_to_save_progress"},
    )

    assert event.event_type == "ended"


def test_transcript_segment_requires_text() -> None:
    segment = TranscriptSegmentIn(
        external_course_id="course-1",
        external_chapter_id="1.1",
        text="这是一段字幕",
        source="dom-visible-text",
        start_seconds=10,
        end_seconds=15,
    )

    assert segment.text == "这是一段字幕"
```

- [ ] **Step 2: Run tests to verify failure**

Run:

```powershell
python -m pytest tests\test_capture.py -q
```

Expected: FAIL because schemas are absent.

- [ ] **Step 3: Implement Pydantic schemas**

Create `apps/api/app/schemas/capture.py`:

```python
from pydantic import BaseModel, Field


class ChapterSnapshotIn(BaseModel):
    external_chapter_id: str
    title: str
    sort_order: int = 0
    duration_seconds: int | None = None
    children: list["ChapterSnapshotIn"] = Field(default_factory=list)


class CourseSnapshotIn(BaseModel):
    adapter_id: str
    site_url: str
    external_course_id: str
    course_title: str
    term: str | None = None
    chapters: list[ChapterSnapshotIn] = Field(default_factory=list)


class VideoEventIn(BaseModel):
    session_id: str
    event_type: str
    video_time_seconds: float | None = None
    payload: dict = Field(default_factory=dict)


class TranscriptSegmentIn(BaseModel):
    external_course_id: str
    external_chapter_id: str
    session_id: str | None = None
    start_seconds: float | None = None
    end_seconds: float | None = None
    text: str = Field(min_length=1)
    source: str
```

- [ ] **Step 4: Run schema tests**

Run:

```powershell
python -m pytest tests\test_capture.py -q
```

Expected: PASS.

- [ ] **Step 5: Commit**

Run:

```powershell
git add apps\api
git commit -m "feat(api): add capture payload schemas"
```

Expected: commit succeeds.

## Task 6: Exporters and Read APIs

**Files:**
- Create: `apps/api/app/exporters/markdown.py`
- Create: `apps/api/app/exporters/json_export.py`
- Create: `apps/api/app/routes/courses.py`
- Create: `apps/api/app/routes/exports.py`
- Modify: `apps/api/app/main.py`
- Create: `apps/api/tests/test_exports.py`

- [ ] **Step 1: Write exporter tests**

Create `apps/api/tests/test_exports.py`:

```python
from app.exporters.markdown import render_course_markdown
from app.exporters.json_export import render_course_json


def sample_course() -> dict:
    return {
        "title": "供应链管理",
        "chapters": [
            {
                "title": "1.1 课程导论",
                "transcripts": [
                    {"start_seconds": 0, "text": "欢迎学习供应链管理"},
                    {"start_seconds": 8.5, "text": "本节介绍课程结构"},
                ],
                "notes": [{"video_time_seconds": 12, "content": "这里要复习"}],
            }
        ],
    }


def test_markdown_export_contains_transcripts_and_notes() -> None:
    output = render_course_markdown(sample_course())

    assert "# 供应链管理" in output
    assert "- 00:00 欢迎学习供应链管理" in output
    assert "- 00:12 这里要复习" in output


def test_json_export_is_stable() -> None:
    output = render_course_json(sample_course())

    assert '"title": "供应链管理"' in output
    assert '"text": "欢迎学习供应链管理"' in output
```

- [ ] **Step 2: Run tests to verify failure**

Run:

```powershell
python -m pytest tests\test_exports.py -q
```

Expected: FAIL because exporters are absent.

- [ ] **Step 3: Implement exporters**

Create `apps/api/app/exporters/markdown.py`:

```python
def format_time(seconds: float | int | None) -> str:
    if seconds is None:
        return "--:--"
    whole = int(seconds)
    minutes = whole // 60
    remaining = whole % 60
    return f"{minutes:02d}:{remaining:02d}"


def render_course_markdown(course: dict) -> str:
    lines = [f"# {course['title']}", ""]
    for chapter in course.get("chapters", []):
        lines.extend([f"## {chapter['title']}", "", "### 字幕", ""])
        for segment in chapter.get("transcripts", []):
            lines.append(f"- {format_time(segment.get('start_seconds'))} {segment['text']}")
        lines.extend(["", "### 笔记", ""])
        for note in chapter.get("notes", []):
            lines.append(f"- {format_time(note.get('video_time_seconds'))} {note['content']}")
        lines.append("")
    return "\n".join(lines).rstrip() + "\n"
```

Create `apps/api/app/exporters/json_export.py`:

```python
import json


def render_course_json(course: dict) -> str:
    return json.dumps(course, ensure_ascii=False, indent=2, sort_keys=True)
```

- [ ] **Step 4: Run exporter tests**

Run:

```powershell
python -m pytest tests\test_exports.py -q
```

Expected: PASS.

- [ ] **Step 5: Commit**

Run:

```powershell
git add apps\api
git commit -m "feat(api): add course exporters"
```

Expected: commit succeeds.

## Task 7: Chrome Extension Adapter Framework

**Files:**
- Create: `apps/extension/package.json`
- Create: `apps/extension/manifest.json`
- Create: `apps/extension/src/adapters/types.ts`
- Create: `apps/extension/src/adapters/registry.ts`
- Create: `apps/extension/src/adapters/genericVideo.ts`
- Create: `apps/extension/src/adapters/genericDomCourse.ts`
- Create: `apps/extension/src/adapters/wencaiSchool.ts`
- Create: `apps/extension/src/__tests__/adapters.test.ts`

- [ ] **Step 1: Write adapter tests**

Create `apps/extension/src/__tests__/adapters.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { pickAdapter } from "../adapters/registry";

describe("adapter registry", () => {
  it("selects wencai adapter for wencai learning domains", () => {
    const adapter = pickAdapter(new URL("https://learning.wencaischool.net/openlearning/console/"));
    expect(adapter.id).toBe("wencai-school");
  });

  it("falls back to generic video adapter for unknown sites", () => {
    const adapter = pickAdapter(new URL("https://example.com/course/video"));
    expect(adapter.id).toBe("generic-video");
  });
});
```

- [ ] **Step 2: Run tests to verify failure**

Run:

```powershell
Set-Location C:\Users\HUAWEI\www\learning-assistant-platform
pnpm --filter @learn-assistant/extension test
```

Expected: FAIL because extension package is absent.

- [ ] **Step 3: Add extension package and manifest**

Create `apps/extension/package.json`:

```json
{
  "name": "@learn-assistant/extension",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "vitest run",
    "build": "tsc --noEmit"
  },
  "devDependencies": {
    "@types/chrome": "^0.0.270",
    "typescript": "^5.6.2",
    "vitest": "^2.1.1"
  }
}
```

Create `apps/extension/manifest.json`:

```json
{
  "manifest_version": 3,
  "name": "Learning Assistant",
  "version": "0.1.0",
  "permissions": ["storage", "activeTab"],
  "host_permissions": ["http://127.0.0.1:17890/*", "https://*/*", "http://*/*"],
  "background": { "service_worker": "dist/background.js", "type": "module" },
  "content_scripts": [
    {
      "matches": ["https://*/*", "http://*/*"],
      "js": ["dist/content.js"],
      "run_at": "document_idle"
    }
  ]
}
```

- [ ] **Step 4: Implement adapter types and registry**

Create `apps/extension/src/adapters/types.ts`:

```ts
export type PageType = "entry" | "course" | "courseware" | "player" | "unknown";

export interface ChapterNode {
  externalChapterId: string;
  title: string;
  sortOrder: number;
  children: ChapterNode[];
}

export interface CourseSnapshot {
  externalCourseId: string;
  title: string;
  term?: string;
  chapters: ChapterNode[];
}

export interface TranscriptSnapshot {
  text: string;
  source: "track" | "dom-visible-text" | "aria-live" | "manual";
}

export interface LearningAdapter {
  id: string;
  name: string;
  matches(url: URL): boolean;
  detectPageType(document: Document, location: Location): PageType;
  extractCourse(document: Document): CourseSnapshot | null;
  extractChapters(document: Document): ChapterNode[];
  findVideo(document: Document): HTMLVideoElement | null;
  extractTranscript(document: Document): TranscriptSnapshot | null;
  extractCurrentChapter(document: Document): ChapterNode | null;
  getNextChapterHint(document: Document): Element | null;
}
```

Create `apps/extension/src/adapters/registry.ts`:

```ts
import { genericDomCourseAdapter } from "./genericDomCourse";
import { genericVideoAdapter } from "./genericVideo";
import type { LearningAdapter } from "./types";
import { wencaiSchoolAdapter } from "./wencaiSchool";

export const adapters: LearningAdapter[] = [
  wencaiSchoolAdapter,
  genericDomCourseAdapter,
  genericVideoAdapter,
];

export function pickAdapter(url: URL): LearningAdapter {
  return adapters.find((adapter) => adapter.matches(url)) ?? genericVideoAdapter;
}
```

- [ ] **Step 5: Implement adapters**

Create `apps/extension/src/adapters/genericVideo.ts`, `genericDomCourse.ts`, and `wencaiSchool.ts`. Each file must implement all `LearningAdapter` methods. The Wencai adapter matches `edu.wencaischool.net` and `learning.wencaischool.net`; it extracts titles from visible headings and chapter rows without clicking any platform control.

- [ ] **Step 6: Run adapter tests**

Run:

```powershell
pnpm --filter @learn-assistant/extension test
```

Expected: PASS.

- [ ] **Step 7: Commit**

Run:

```powershell
git add apps\extension
git commit -m "feat(extension): add adapter framework"
```

Expected: commit succeeds.

## Task 8: Extension Safety Guardrails and Capture Client

**Files:**
- Create: `apps/extension/src/safety/guardrails.ts`
- Create: `apps/extension/src/capture/client.ts`
- Create: `apps/extension/src/ui/overlay.ts`
- Create: `apps/extension/src/content.ts`
- Create: `apps/extension/src/background.ts`
- Create: `apps/extension/src/__tests__/guardrails.test.ts`

- [ ] **Step 1: Write guardrail tests**

Create `apps/extension/src/__tests__/guardrails.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { isForbiddenPlatformActionText } from "../safety/guardrails";

describe("platform action guardrails", () => {
  it("blocks learning-record mutation actions", () => {
    expect(isForbiddenPlatformActionText("保存学习进度")).toBe(true);
    expect(isForbiddenPlatformActionText("开始学习")).toBe(true);
    expect(isForbiddenPlatformActionText("继续学习")).toBe(true);
    expect(isForbiddenPlatformActionText("下一章")).toBe(true);
  });

  it("allows assistant-only actions", () => {
    expect(isForbiddenPlatformActionText("导出字幕")).toBe(false);
    expect(isForbiddenPlatformActionText("添加笔记")).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify failure**

Run:

```powershell
pnpm --filter @learn-assistant/extension test
```

Expected: FAIL because guardrails are absent.

- [ ] **Step 3: Implement guardrails**

Create `apps/extension/src/safety/guardrails.ts`:

```ts
const forbiddenActionTexts = [
  "保存学习进度",
  "开始学习",
  "继续学习",
  "下一章",
  "下一节",
  "提交",
  "完成学习",
];

export function isForbiddenPlatformActionText(text: string): boolean {
  const normalized = text.replace(/\s+/g, "");
  return forbiddenActionTexts.some((item) => normalized.includes(item));
}

export function assertAssistantOnlyElement(element: Element): void {
  const text = element.textContent ?? "";
  if (isForbiddenPlatformActionText(text)) {
    throw new Error(`Blocked platform-mutating action: ${text}`);
  }
}
```

- [ ] **Step 4: Implement capture client**

Create `apps/extension/src/capture/client.ts`:

```ts
export interface CaptureClientOptions {
  apiBaseUrl: string;
  apiToken: string;
}

export class CaptureClient {
  constructor(private readonly options: CaptureClientOptions) {}

  async post(path: string, body: unknown): Promise<void> {
    const response = await fetch(`${this.options.apiBaseUrl}${path}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${this.options.apiToken}`,
      },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      throw new Error(`Capture request failed: ${response.status}`);
    }
  }
}
```

- [ ] **Step 5: Implement overlay and content script**

Create an overlay with assistant-only buttons: record status, add note, export hint, and next chapter highlight. Do not bind click handlers to platform buttons. In `content.ts`, select an adapter, observe video events, observe text changes, and call `CaptureClient.post` for assistant data only.

- [ ] **Step 6: Run extension tests**

Run:

```powershell
pnpm --filter @learn-assistant/extension test
```

Expected: PASS.

- [ ] **Step 7: Commit**

Run:

```powershell
git add apps\extension
git commit -m "feat(extension): add safe capture overlay"
```

Expected: commit succeeds.

## Task 9: React Console Skeleton

**Files:**
- Create: `apps/console/package.json`
- Create: `apps/console/index.html`
- Create: `apps/console/src/main.tsx`
- Create: `apps/console/src/App.tsx`
- Create: `apps/console/src/api/client.ts`
- Create: `apps/console/src/pages/Dashboard.tsx`
- Create: `apps/console/src/pages/Courses.tsx`
- Create: `apps/console/src/pages/CourseDetail.tsx`
- Create: `apps/console/src/pages/Exports.tsx`
- Create: `apps/console/src/pages/Settings.tsx`
- Create: `apps/console/src/styles.css`
- Create: `apps/console/src/App.test.tsx`

- [ ] **Step 1: Write console smoke test**

Create `apps/console/src/App.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { App } from "./App";

describe("App", () => {
  it("renders the work console navigation", () => {
    render(<App />);

    expect(screen.getByText("学习助手控制台")).toBeInTheDocument();
    expect(screen.getByText("课程")).toBeInTheDocument();
    expect(screen.getByText("导出")).toBeInTheDocument();
    expect(screen.getByText("站点适配器")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify failure**

Run:

```powershell
pnpm --filter @learn-assistant/console test
```

Expected: FAIL because console package is absent.

- [ ] **Step 3: Add console package and app**

Create `apps/console/package.json`:

```json
{
  "name": "@learn-assistant/console",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite --host 127.0.0.1 --port 17891",
    "test": "vitest run",
    "build": "tsc --noEmit && vite build"
  },
  "dependencies": {
    "@vitejs/plugin-react": "^4.3.2",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "vite": "^5.4.8"
  },
  "devDependencies": {
    "@testing-library/jest-dom": "^6.4.8",
    "@testing-library/react": "^16.0.1",
    "@types/react": "^18.3.9",
    "@types/react-dom": "^18.3.0",
    "typescript": "^5.6.2",
    "vitest": "^2.1.1"
  }
}
```

Create `apps/console/src/App.tsx`:

```tsx
import "./styles.css";

const navItems = ["课程", "字幕", "笔记", "导出", "站点适配器", "用户与授权", "设置"];

export function App() {
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <h1>学习助手控制台</h1>
        <nav>
          {navItems.map((item) => (
            <button key={item} type="button">
              {item}
            </button>
          ))}
        </nav>
      </aside>
      <main className="workspace">
        <section className="status-row">
          <span>API 服务: 待连接</span>
          <span>插件状态: 待绑定</span>
          <span>组织: Local Workspace</span>
        </section>
        <section className="dashboard-grid">
          <article>
            <h2>最近课程</h2>
            <p>课程采集后会显示在这里。</p>
          </article>
          <article>
            <h2>待处理提醒</h2>
            <p>视频结束后的手动保存提醒会显示在这里。</p>
          </article>
        </section>
      </main>
    </div>
  );
}
```

Create `apps/console/src/main.tsx`:

```tsx
import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
```

Create `apps/console/src/styles.css` with restrained work-console styling: fixed sidebar, compact navigation buttons, dense dashboard grid, readable table-ready typography.

- [ ] **Step 4: Run console test**

Run:

```powershell
pnpm --filter @learn-assistant/console test
```

Expected: PASS.

- [ ] **Step 5: Commit**

Run:

```powershell
git add apps\console
git commit -m "feat(console): add management console shell"
```

Expected: commit succeeds.

## Task 10: Scripts, README, and Verification

**Files:**
- Create: `scripts/dev.ps1`
- Create: `scripts/db.ps1`
- Create: `scripts/open-learning-site.ps1`
- Create: `README.md`
- Modify as needed: `.env.example`

- [ ] **Step 1: Add Windows scripts**

Create `scripts/dev.ps1`:

```powershell
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot

Start-Process powershell -ArgumentList "-NoExit", "-Command", "Set-Location '$Root\apps\api'; python -m uvicorn app.main:app --host 127.0.0.1 --port 17890"
Start-Process powershell -ArgumentList "-NoExit", "-Command", "Set-Location '$Root'; pnpm --filter @learn-assistant/console dev"
Start-Process "http://127.0.0.1:17891"
```

Create `scripts/db.ps1`:

```powershell
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
Set-Location "$Root\apps\api"
python -m alembic upgrade head
```

Create `scripts/open-learning-site.ps1`:

```powershell
$ErrorActionPreference = "Stop"
Start-Process "https://edu.wencaischool.net/dzkjzs_student/console/templates/normal/"
```

- [ ] **Step 2: Add README**

Create `README.md` with:

```markdown
# Learning Assistant Platform

通用学习内容采集与笔记平台。系统包含 Chrome 插件、Python FastAPI 服务、PostgreSQL 数据库和 React 控制台。

## 合规边界

本项目只做学习资料采集、字幕整理、笔记、提醒、高亮和导出。不自动刷课，不伪造学习记录，不自动保存平台学习进度，不绕过视频播放或平台检测。

## 本地开发

1. 安装 Python 3.11、Node.js、pnpm、PostgreSQL。
2. 复制 `.env.example` 为 `.env` 并配置 `DATABASE_URL`。
3. 在 `apps/api` 安装 Python 依赖。
4. 在项目根目录运行 `pnpm install`。
5. 运行 `scripts\db.ps1` 初始化数据库。
6. 运行 `scripts\dev.ps1` 启动 API 和控制台。
7. 在 Chrome 扩展管理页加载 `apps/extension` 构建结果。

## 默认端口

- API: `http://127.0.0.1:17890`
- 控制台: `http://127.0.0.1:17891`
```

- [ ] **Step 3: Run verification**

Run:

```powershell
Set-Location C:\Users\HUAWEI\www\learning-assistant-platform
python -m pytest apps\api\tests -q
pnpm test
pnpm build
```

Expected: backend tests pass, extension and console tests pass, TypeScript builds pass.

- [ ] **Step 4: Commit**

Run:

```powershell
git add README.md scripts .env.example
git commit -m "docs: add local development workflow"
```

Expected: commit succeeds.

## Self-Review

Spec coverage:

- Public extension and adapter model: Tasks 7 and 8.
- Python FastAPI standard service: Tasks 2 through 6.
- PostgreSQL first-class persistence: Task 3.
- Commercialization-ready organization, user, token, license fields: Task 3.
- React management console: Task 9.
- Windows startup scripts and README: Task 10.
- Wencai adapter as first real site: Task 7.
- Compliance boundaries and forbidden automation: Tasks 8 and 10.

Red-flag scan:

- The plan contains no unresolved marker text and no task that asks an implementer to invent an unspecified API contract.

Type consistency:

- Capture schemas use `external_course_id`, `external_chapter_id`, and `session_id`, matching the service and extension capture concepts.
- Database names match the approved design document.
- Extension adapter methods match the `LearningAdapter` interface.
