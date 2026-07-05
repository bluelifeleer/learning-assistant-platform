from datetime import datetime
from uuid import uuid4

from sqlalchemy import JSON, DateTime, ForeignKey, Integer, Numeric, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


def new_uuid() -> str:
    return str(uuid4())


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Organization(Base, TimestampMixin):
    __tablename__ = "organizations"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    plan: Mapped[str] = mapped_column(String(50), default="local")
    license_key: Mapped[str | None] = mapped_column(String(200))
    license_status: Mapped[str] = mapped_column(String(50), default="inactive")


class User(Base, TimestampMixin):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    username: Mapped[str | None] = mapped_column(String(50), unique=True)
    email: Mapped[str] = mapped_column(String(320), nullable=False, unique=True)
    display_name: Mapped[str] = mapped_column(String(120), nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)


class Membership(Base):
    __tablename__ = "memberships"
    __table_args__ = (UniqueConstraint("organization_id", "user_id", name="uq_membership_org_user"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    organization_id: Mapped[str] = mapped_column(ForeignKey("organizations.id"), nullable=False)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), nullable=False)
    role: Mapped[str] = mapped_column(String(50), nullable=False)


class ApiToken(Base):
    __tablename__ = "api_tokens"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    organization_id: Mapped[str] = mapped_column(ForeignKey("organizations.id"), nullable=False)
    user_id: Mapped[str | None] = mapped_column(ForeignKey("users.id"))
    token_hash: Mapped[str] = mapped_column(String(255), nullable=False, unique=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    last_used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class PluginClient(Base, TimestampMixin):
    __tablename__ = "plugin_clients"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    organization_id: Mapped[str] = mapped_column(ForeignKey("organizations.id"), nullable=False)
    token_id: Mapped[str] = mapped_column(ForeignKey("api_tokens.id"), nullable=False, unique=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    extension_version: Mapped[str | None] = mapped_column(String(40))
    current_url: Mapped[str | None] = mapped_column(Text)
    adapter_id: Mapped[str | None] = mapped_column(String(120))
    adapter_name: Mapped[str | None] = mapped_column(String(200))
    enabled_adapters: Mapped[list[str]] = mapped_column(JSON, default=list)
    last_seen_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class Site(Base):
    __tablename__ = "sites"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    adapter_id: Mapped[str] = mapped_column(String(120), nullable=False, unique=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    host_patterns: Mapped[dict] = mapped_column(JSON, default=dict)
    status: Mapped[str] = mapped_column(String(50), default="enabled")


class Course(Base, TimestampMixin):
    __tablename__ = "courses"
    __table_args__ = (UniqueConstraint("organization_id", "site_id", "external_course_id", name="uq_course_external"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    organization_id: Mapped[str] = mapped_column(ForeignKey("organizations.id"), nullable=False)
    site_id: Mapped[str] = mapped_column(ForeignKey("sites.id"), nullable=False)
    external_course_id: Mapped[str] = mapped_column(String(255), nullable=False)
    title: Mapped[str] = mapped_column(String(500), nullable=False)
    term: Mapped[str | None] = mapped_column(String(120))
    extra: Mapped[dict] = mapped_column("metadata", JSON, default=dict)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    chapters: Mapped[list["Chapter"]] = relationship(back_populates="course")


class Chapter(Base):
    __tablename__ = "chapters"
    __table_args__ = (UniqueConstraint("course_id", "external_chapter_id", name="uq_chapter_external"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    course_id: Mapped[str] = mapped_column(ForeignKey("courses.id"), nullable=False)
    parent_id: Mapped[str | None] = mapped_column(ForeignKey("chapters.id"))
    external_chapter_id: Mapped[str] = mapped_column(String(255), nullable=False)
    title: Mapped[str] = mapped_column(String(500), nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    duration_seconds: Mapped[int | None] = mapped_column(Integer)
    extra: Mapped[dict] = mapped_column("metadata", JSON, default=dict)
    course: Mapped[Course] = relationship(back_populates="chapters")


class VideoSession(Base):
    __tablename__ = "video_sessions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    course_id: Mapped[str] = mapped_column(ForeignKey("courses.id"), nullable=False)
    chapter_id: Mapped[str] = mapped_column(ForeignKey("chapters.id"), nullable=False)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), nullable=False)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    duration_watched_seconds: Mapped[int] = mapped_column(Integer, default=0)
    source_url: Mapped[str] = mapped_column(Text, nullable=False)


class TimelineEvent(Base, TimestampMixin):
    __tablename__ = "timeline_events"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    video_session_id: Mapped[str] = mapped_column(ForeignKey("video_sessions.id"), nullable=False)
    event_type: Mapped[str] = mapped_column(String(80), nullable=False)
    video_time_seconds: Mapped[float | None] = mapped_column(Numeric(10, 3))
    payload: Mapped[dict] = mapped_column(JSON, default=dict)


class TranscriptSegment(Base, TimestampMixin):
    __tablename__ = "transcript_segments"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    course_id: Mapped[str] = mapped_column(ForeignKey("courses.id"), nullable=False)
    chapter_id: Mapped[str] = mapped_column(ForeignKey("chapters.id"), nullable=False)
    video_session_id: Mapped[str | None] = mapped_column(ForeignKey("video_sessions.id"))
    start_seconds: Mapped[float | None] = mapped_column(Numeric(10, 3))
    end_seconds: Mapped[float | None] = mapped_column(Numeric(10, 3))
    text: Mapped[str] = mapped_column(Text, nullable=False)
    source: Mapped[str] = mapped_column(String(80), nullable=False)


class Note(Base, TimestampMixin):
    __tablename__ = "notes"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    course_id: Mapped[str] = mapped_column(ForeignKey("courses.id"), nullable=False)
    chapter_id: Mapped[str | None] = mapped_column(ForeignKey("chapters.id"))
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), nullable=False)
    video_time_seconds: Mapped[float | None] = mapped_column(Numeric(10, 3))
    content: Mapped[str] = mapped_column(Text, nullable=False)


class Export(Base, TimestampMixin):
    __tablename__ = "exports"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    organization_id: Mapped[str] = mapped_column(ForeignKey("organizations.id"), nullable=False)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), nullable=False)
    course_id: Mapped[str | None] = mapped_column(ForeignKey("courses.id"))
    format: Mapped[str] = mapped_column(String(40), nullable=False)
    status: Mapped[str] = mapped_column(String(40), nullable=False)
    file_path: Mapped[str | None] = mapped_column(Text)


class AuditLog(Base, TimestampMixin):
    __tablename__ = "audit_logs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    organization_id: Mapped[str | None] = mapped_column(ForeignKey("organizations.id"))
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), nullable=False)
    action: Mapped[str] = mapped_column(String(120), nullable=False)
    resource_type: Mapped[str | None] = mapped_column(String(120))
    resource_id: Mapped[str | None] = mapped_column(String(120))
    payload: Mapped[dict] = mapped_column(JSON, default=dict)
