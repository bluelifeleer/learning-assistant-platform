from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa

revision: str = "0004_video_capture_events"
down_revision: str | None = "0003_usernames"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

ID = sa.String(length=36)
JSON = sa.JSON()


def upgrade() -> None:
    op.create_table(
        "video_capture_events",
        sa.Column("id", ID, primary_key=True),
        sa.Column("organization_id", ID, sa.ForeignKey("organizations.id"), nullable=False),
        sa.Column("session_id", sa.String(length=255), nullable=False),
        sa.Column("event_type", sa.String(length=80), nullable=False),
        sa.Column("video_time_seconds", sa.Numeric(10, 3), nullable=True),
        sa.Column("course_url", sa.Text(), nullable=True),
        sa.Column("external_course_id", sa.String(length=255), nullable=True),
        sa.Column("external_chapter_id", sa.String(length=255), nullable=True),
        sa.Column("video_source", JSON, nullable=False),
        sa.Column("payload", JSON, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_video_capture_events_created_at", "video_capture_events", ["created_at"])
    op.create_index("ix_video_capture_events_session_id", "video_capture_events", ["session_id"])


def downgrade() -> None:
    op.drop_index("ix_video_capture_events_session_id", table_name="video_capture_events")
    op.drop_index("ix_video_capture_events_created_at", table_name="video_capture_events")
    op.drop_table("video_capture_events")
