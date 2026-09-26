"""unique active ai task per target

Revision ID: 0015_ai_task_active_unique
Revises: 0014_token_expiry
Create Date: 2026-09-26

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0015_ai_task_active_unique"
down_revision: str | None = "0014_token_expiry"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    op.create_index(
        "uq_ai_task_active",
        "ai_tasks",
        ["task_type", "course_id", "chapter_id"],
        unique=True,
        postgresql_where=sa.text("status IN ('pending', 'running')"),
        sqlite_where=sa.text("status IN ('pending', 'running')"),
    )


def downgrade() -> None:
    op.drop_index("uq_ai_task_active", table_name="ai_tasks")
