"""learning progress and screenshot ocr

Revision ID: 0012_progress_ocr
Revises: 0011_mastery_email
Create Date: 2026-09-24

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0012_progress_ocr"
down_revision: str | None = "0011_mastery_email"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table("organizations") as batch_op:
        batch_op.add_column(sa.Column("weekly_goal_minutes", sa.Integer(), nullable=False, server_default="300"))
        batch_op.add_column(sa.Column("llm_vision_model", sa.String(length=120), nullable=True))
    with op.batch_alter_table("screenshots") as batch_op:
        batch_op.add_column(sa.Column("ocr_text", sa.Text(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("screenshots") as batch_op:
        batch_op.drop_column("ocr_text")
    with op.batch_alter_table("organizations") as batch_op:
        batch_op.drop_column("llm_vision_model")
        batch_op.drop_column("weekly_goal_minutes")
