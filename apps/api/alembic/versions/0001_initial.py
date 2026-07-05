from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa

revision: str = "0001_initial"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

ID = sa.String(length=36)
JSON = sa.JSON()


def upgrade() -> None:
    op.create_table(
        "organizations",
        sa.Column("id", ID, primary_key=True),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("plan", sa.String(length=50), nullable=False),
        sa.Column("license_key", sa.String(length=200), nullable=True),
        sa.Column("license_status", sa.String(length=50), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_table(
        "users",
        sa.Column("id", ID, primary_key=True),
        sa.Column("email", sa.String(length=320), nullable=False, unique=True),
        sa.Column("display_name", sa.String(length=120), nullable=False),
        sa.Column("password_hash", sa.String(length=255), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_table(
        "sites",
        sa.Column("id", ID, primary_key=True),
        sa.Column("adapter_id", sa.String(length=120), nullable=False, unique=True),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("host_patterns", JSON, nullable=False),
        sa.Column("status", sa.String(length=50), nullable=False),
    )
    op.create_table(
        "memberships",
        sa.Column("id", ID, primary_key=True),
        sa.Column("organization_id", ID, sa.ForeignKey("organizations.id"), nullable=False),
        sa.Column("user_id", ID, sa.ForeignKey("users.id"), nullable=False),
        sa.Column("role", sa.String(length=50), nullable=False),
        sa.UniqueConstraint("organization_id", "user_id", name="uq_membership_org_user"),
    )
    op.create_table(
        "api_tokens",
        sa.Column("id", ID, primary_key=True),
        sa.Column("organization_id", ID, sa.ForeignKey("organizations.id"), nullable=False),
        sa.Column("user_id", ID, sa.ForeignKey("users.id"), nullable=True),
        sa.Column("token_hash", sa.String(length=255), nullable=False, unique=True),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("last_used_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_table(
        "courses",
        sa.Column("id", ID, primary_key=True),
        sa.Column("organization_id", ID, sa.ForeignKey("organizations.id"), nullable=False),
        sa.Column("site_id", ID, sa.ForeignKey("sites.id"), nullable=False),
        sa.Column("external_course_id", sa.String(length=255), nullable=False),
        sa.Column("title", sa.String(length=500), nullable=False),
        sa.Column("term", sa.String(length=120), nullable=True),
        sa.Column("metadata", JSON, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("organization_id", "site_id", "external_course_id", name="uq_course_external"),
    )
    op.create_table(
        "chapters",
        sa.Column("id", ID, primary_key=True),
        sa.Column("course_id", ID, sa.ForeignKey("courses.id"), nullable=False),
        sa.Column("parent_id", ID, sa.ForeignKey("chapters.id"), nullable=True),
        sa.Column("external_chapter_id", sa.String(length=255), nullable=False),
        sa.Column("title", sa.String(length=500), nullable=False),
        sa.Column("sort_order", sa.Integer(), nullable=False),
        sa.Column("duration_seconds", sa.Integer(), nullable=True),
        sa.Column("metadata", JSON, nullable=False),
        sa.UniqueConstraint("course_id", "external_chapter_id", name="uq_chapter_external"),
    )
    op.create_table(
        "video_sessions",
        sa.Column("id", ID, primary_key=True),
        sa.Column("course_id", ID, sa.ForeignKey("courses.id"), nullable=False),
        sa.Column("chapter_id", ID, sa.ForeignKey("chapters.id"), nullable=False),
        sa.Column("user_id", ID, sa.ForeignKey("users.id"), nullable=True),
        sa.Column("started_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("ended_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("duration_watched_seconds", sa.Integer(), nullable=False),
        sa.Column("source_url", sa.Text(), nullable=False),
    )
    op.create_table(
        "timeline_events",
        sa.Column("id", ID, primary_key=True),
        sa.Column("video_session_id", ID, sa.ForeignKey("video_sessions.id"), nullable=False),
        sa.Column("event_type", sa.String(length=80), nullable=False),
        sa.Column("video_time_seconds", sa.Numeric(10, 3), nullable=True),
        sa.Column("payload", JSON, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_table(
        "transcript_segments",
        sa.Column("id", ID, primary_key=True),
        sa.Column("course_id", ID, sa.ForeignKey("courses.id"), nullable=False),
        sa.Column("chapter_id", ID, sa.ForeignKey("chapters.id"), nullable=False),
        sa.Column("video_session_id", ID, sa.ForeignKey("video_sessions.id"), nullable=True),
        sa.Column("start_seconds", sa.Numeric(10, 3), nullable=True),
        sa.Column("end_seconds", sa.Numeric(10, 3), nullable=True),
        sa.Column("text", sa.Text(), nullable=False),
        sa.Column("source", sa.String(length=80), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_table(
        "notes",
        sa.Column("id", ID, primary_key=True),
        sa.Column("course_id", ID, sa.ForeignKey("courses.id"), nullable=False),
        sa.Column("chapter_id", ID, sa.ForeignKey("chapters.id"), nullable=True),
        sa.Column("user_id", ID, sa.ForeignKey("users.id"), nullable=True),
        sa.Column("video_time_seconds", sa.Numeric(10, 3), nullable=True),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_table(
        "exports",
        sa.Column("id", ID, primary_key=True),
        sa.Column("organization_id", ID, sa.ForeignKey("organizations.id"), nullable=False),
        sa.Column("user_id", ID, sa.ForeignKey("users.id"), nullable=True),
        sa.Column("course_id", ID, sa.ForeignKey("courses.id"), nullable=True),
        sa.Column("format", sa.String(length=40), nullable=False),
        sa.Column("status", sa.String(length=40), nullable=False),
        sa.Column("file_path", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_table(
        "audit_logs",
        sa.Column("id", ID, primary_key=True),
        sa.Column("organization_id", ID, sa.ForeignKey("organizations.id"), nullable=True),
        sa.Column("user_id", ID, sa.ForeignKey("users.id"), nullable=True),
        sa.Column("action", sa.String(length=120), nullable=False),
        sa.Column("resource_type", sa.String(length=120), nullable=True),
        sa.Column("resource_id", sa.String(length=120), nullable=True),
        sa.Column("payload", JSON, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )


def downgrade() -> None:
    for table in [
        "audit_logs",
        "exports",
        "notes",
        "transcript_segments",
        "timeline_events",
        "video_sessions",
        "chapters",
        "courses",
        "api_tokens",
        "memberships",
        "sites",
        "users",
        "organizations",
    ]:
        op.drop_table(table)
