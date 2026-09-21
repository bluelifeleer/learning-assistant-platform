from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa

revision: str = "0006_screenshots"
down_revision: str | None = "0005_review_cards"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

ID = sa.String(length=36)


def upgrade() -> None:
    op.create_table(
        "screenshots",
        sa.Column("id", ID, primary_key=True),
        sa.Column("organization_id", ID, sa.ForeignKey("organizations.id"), nullable=False),
        sa.Column("course_id", ID, sa.ForeignKey("courses.id"), nullable=False),
        sa.Column("chapter_id", ID, sa.ForeignKey("chapters.id"), nullable=True),
        sa.Column("user_id", ID, sa.ForeignKey("users.id"), nullable=False),
        sa.Column("video_time_seconds", sa.Numeric(10, 3), nullable=True),
        sa.Column("file_path", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_screenshots_course_id", "screenshots", ["course_id"])


def downgrade() -> None:
    op.drop_index("ix_screenshots_course_id", table_name="screenshots")
    op.drop_table("screenshots")
