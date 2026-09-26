"""chapter memos (manual summaries)

Revision ID: 0016_chapter_memo
Revises: 0015_ai_task_active_unique
Create Date: 2026-09-26

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0016_chapter_memo"
down_revision: str | None = "0015_ai_task_active_unique"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "chapter_memos",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("chapter_id", sa.String(length=36), sa.ForeignKey("chapters.id"), nullable=False),
        sa.Column("course_id", sa.String(length=36), sa.ForeignKey("courses.id"), nullable=False),
        sa.Column("content_md", sa.Text(), nullable=False, server_default=""),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("chapter_id", name="uq_chapter_memo_chapter"),
    )


def downgrade() -> None:
    op.drop_table("chapter_memos")
