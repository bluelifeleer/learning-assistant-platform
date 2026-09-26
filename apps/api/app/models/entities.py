from datetime import datetime
from uuid import uuid4

from sqlalchemy import JSON, Boolean, DateTime, Float, ForeignKey, Index, Integer, Numeric, String, Text, UniqueConstraint, func, text
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
    llm_base_url: Mapped[str | None] = mapped_column(String(500))
    llm_api_key: Mapped[str | None] = mapped_column(String(500))
    llm_model: Mapped[str | None] = mapped_column(String(120))
    llm_vision_model: Mapped[str | None] = mapped_column(String(120))
    ai_auto_generate: Mapped[bool] = mapped_column(Boolean, default=False)
    smtp_host: Mapped[str | None] = mapped_column(String(200))
    smtp_port: Mapped[int] = mapped_column(Integer, default=465)
    smtp_username: Mapped[str | None] = mapped_column(String(200))
    smtp_password: Mapped[str | None] = mapped_column(String(500))
    email_from: Mapped[str | None] = mapped_column(String(320))
    email_to: Mapped[str | None] = mapped_column(String(320))
    digest_auto: Mapped[bool] = mapped_column(Boolean, default=False)
    digest_frequency: Mapped[str] = mapped_column(String(20), default="daily")
    digest_hour: Mapped[int] = mapped_column(Integer, default=8)
    last_digest_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    weekly_goal_minutes: Mapped[int] = mapped_column(Integer, default=300)


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
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
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
    __table_args__ = (
        # 学习进度/时长统计按 (用户, 开始时间) 过滤
        Index("ix_video_sessions_user_started", "user_id", "started_at"),
        Index("ix_video_sessions_chapter", "chapter_id"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    external_session_id: Mapped[str | None] = mapped_column(String(255), index=True)
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


class VideoCaptureEvent(Base, TimestampMixin):
    __tablename__ = "video_capture_events"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    organization_id: Mapped[str] = mapped_column(ForeignKey("organizations.id"), nullable=False)
    session_id: Mapped[str] = mapped_column(String(255), nullable=False)
    event_type: Mapped[str] = mapped_column(String(80), nullable=False)
    video_time_seconds: Mapped[float | None] = mapped_column(Numeric(10, 3))
    course_url: Mapped[str | None] = mapped_column(Text)
    external_course_id: Mapped[str | None] = mapped_column(String(255))
    external_chapter_id: Mapped[str | None] = mapped_column(String(255))
    video_source: Mapped[dict] = mapped_column(JSON, default=dict)
    payload: Mapped[dict] = mapped_column(JSON, default=dict)


class TranscriptSegment(Base, TimestampMixin):
    __tablename__ = "transcript_segments"
    __table_args__ = (
        # 章节字幕按时间轴读取;OCR 去重额外按 source + start_seconds 过滤
        Index("ix_transcript_segments_chapter_source_start", "chapter_id", "source", "start_seconds"),
        Index("ix_transcript_segments_course", "course_id"),
    )

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
    __table_args__ = (
        # 笔记列表按 (用户, 创建时间倒序) 分页
        Index("ix_notes_user_created", "user_id", "created_at"),
        Index("ix_notes_chapter", "chapter_id"),
        Index("ix_notes_course", "course_id"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    course_id: Mapped[str] = mapped_column(ForeignKey("courses.id"), nullable=False)
    chapter_id: Mapped[str | None] = mapped_column(ForeignKey("chapters.id"))
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), nullable=False)
    video_time_seconds: Mapped[float | None] = mapped_column(Numeric(10, 3))
    content: Mapped[str] = mapped_column(Text, nullable=False)
    # 勘误后的内容;原文 content 永不修改,便于比对字幕识别错误
    corrected_content: Mapped[str | None] = mapped_column(Text)
    # 学习标签,如 考点/高频/简答,可多选
    tags: Mapped[list | None] = mapped_column(JSON, default=list)


class Export(Base, TimestampMixin):
    __tablename__ = "exports"
    # 导出列表按创建时间倒序 + LIMIT
    __table_args__ = (Index("ix_exports_created", "created_at"),)

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


class ReviewCard(Base, TimestampMixin):
    __tablename__ = "review_cards"
    # 取"某用户到期卡片"
    __table_args__ = (Index("ix_review_cards_user_due", "user_id", "due_at"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    organization_id: Mapped[str] = mapped_column(ForeignKey("organizations.id"), nullable=False)
    note_id: Mapped[str | None] = mapped_column(ForeignKey("notes.id"))
    course_id: Mapped[str] = mapped_column(ForeignKey("courses.id"), nullable=False)
    chapter_id: Mapped[str | None] = mapped_column(ForeignKey("chapters.id"))
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), nullable=False)
    front: Mapped[str] = mapped_column(Text, nullable=False)
    back: Mapped[str] = mapped_column(Text, nullable=False)
    ease_factor: Mapped[float] = mapped_column(Float, default=2.5)
    interval_days: Mapped[int] = mapped_column(Integer, default=0)
    due_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    review_count: Mapped[int] = mapped_column(Integer, default=0)


class ReviewLog(Base):
    __tablename__ = "review_logs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    card_id: Mapped[str] = mapped_column(ForeignKey("review_cards.id"), nullable=False)
    result: Mapped[str] = mapped_column(String(20), nullable=False)
    reviewed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Screenshot(Base, TimestampMixin):
    __tablename__ = "screenshots"
    __table_args__ = (
        # 与迁移 0006 保持一致(此前只建在库里,模型没声明,导致测试库缺这条索引)
        Index("ix_screenshots_course_id", "course_id"),
        Index("ix_screenshots_chapter", "chapter_id"),
        Index("ix_screenshots_user", "user_id"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    organization_id: Mapped[str] = mapped_column(ForeignKey("organizations.id"), nullable=False)
    course_id: Mapped[str] = mapped_column(ForeignKey("courses.id"), nullable=False)
    chapter_id: Mapped[str | None] = mapped_column(ForeignKey("chapters.id"))
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), nullable=False)
    video_time_seconds: Mapped[float | None] = mapped_column(Numeric(10, 3))
    file_path: Mapped[str] = mapped_column(Text, nullable=False)
    ocr_text: Mapped[str | None] = mapped_column(Text)


class NoteImage(Base, TimestampMixin):
    __tablename__ = "note_images"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    organization_id: Mapped[str] = mapped_column(ForeignKey("organizations.id"), nullable=False)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), nullable=False)
    file_path: Mapped[str] = mapped_column(Text, nullable=False)


class ChapterSummary(Base, TimestampMixin):
    __tablename__ = "chapter_summaries"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    chapter_id: Mapped[str] = mapped_column(ForeignKey("chapters.id"), nullable=False, unique=True)
    course_id: Mapped[str] = mapped_column(ForeignKey("courses.id"), nullable=False)
    summary_md: Mapped[str] = mapped_column(Text, nullable=False)
    outline: Mapped[list] = mapped_column(JSON, default=list)
    key_points: Mapped[list] = mapped_column(JSON, default=list)
    model: Mapped[str] = mapped_column(String(120), nullable=False)
    status: Mapped[str] = mapped_column(String(40), default="done")
    error: Mapped[str | None] = mapped_column(Text)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class ChapterMemo(Base, TimestampMixin):
    """章节总结:用户在课程详情页手写/编辑的总结,与 AI 生成的 ChapterSummary 相互独立。"""

    __tablename__ = "chapter_memos"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    chapter_id: Mapped[str] = mapped_column(ForeignKey("chapters.id"), nullable=False, unique=True)
    course_id: Mapped[str] = mapped_column(ForeignKey("courses.id"), nullable=False)
    content_md: Mapped[str] = mapped_column(Text, nullable=False, default="")
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class CourseSummary(Base, TimestampMixin):
    __tablename__ = "course_summaries"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    course_id: Mapped[str] = mapped_column(ForeignKey("courses.id"), nullable=False, unique=True)
    summary_md: Mapped[str] = mapped_column(Text, nullable=False)
    outline: Mapped[list] = mapped_column(JSON, default=list)
    key_points: Mapped[list] = mapped_column(JSON, default=list)
    model: Mapped[str] = mapped_column(String(120), nullable=False)
    status: Mapped[str] = mapped_column(String(40), default="done")
    error: Mapped[str | None] = mapped_column(Text)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class QuizQuestion(Base, TimestampMixin):
    __tablename__ = "quiz_questions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    course_id: Mapped[str] = mapped_column(ForeignKey("courses.id"), nullable=False)
    chapter_id: Mapped[str] = mapped_column(ForeignKey("chapters.id"), nullable=False)
    question_type: Mapped[str] = mapped_column(String(40), nullable=False)
    question: Mapped[str] = mapped_column(Text, nullable=False)
    options: Mapped[list] = mapped_column(JSON, default=list)
    answer: Mapped[str] = mapped_column(Text, nullable=False)
    explanation: Mapped[str | None] = mapped_column(Text)
    model: Mapped[str] = mapped_column(String(120), nullable=False)


class QuizAttempt(Base, TimestampMixin):
    __tablename__ = "quiz_attempts"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    organization_id: Mapped[str] = mapped_column(ForeignKey("organizations.id"), nullable=False)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), nullable=False)
    question_id: Mapped[str] = mapped_column(ForeignKey("quiz_questions.id"), nullable=False)
    course_id: Mapped[str] = mapped_column(ForeignKey("courses.id"), nullable=False)
    chapter_id: Mapped[str] = mapped_column(ForeignKey("chapters.id"), nullable=False)
    chosen: Mapped[str] = mapped_column(Text, nullable=False)
    correct: Mapped[bool] = mapped_column(Boolean, nullable=False)


class AiTask(Base, TimestampMixin):
    __tablename__ = "ai_tasks"
    __table_args__ = (
        # 同一章节/课程的同一类任务只允许存在一个活跃(pending/running)实例,防止并发重复生成。
        # email_digest 等 course_id/chapter_id 为 NULL 的组织级任务不受此约束(NULL 在唯一索引中互不相同)。
        Index(
            "uq_ai_task_active",
            "task_type",
            "course_id",
            "chapter_id",
            unique=True,
            postgresql_where=text("status IN ('pending', 'running')"),
            sqlite_where=text("status IN ('pending', 'running')"),
        ),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    organization_id: Mapped[str] = mapped_column(ForeignKey("organizations.id"), nullable=False)
    task_type: Mapped[str] = mapped_column(String(40), nullable=False)
    # email_digest 等组织级任务没有课程上下文,course_id 可空
    course_id: Mapped[str | None] = mapped_column(ForeignKey("courses.id"))
    chapter_id: Mapped[str | None] = mapped_column(ForeignKey("chapters.id"))
    status: Mapped[str] = mapped_column(String(40), default="pending")
    result_count: Mapped[int] = mapped_column(Integer, default=0)
    error: Mapped[str | None] = mapped_column(Text)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
