"""track video sessions by external session id

Revision ID: 0013_video_session_tracking
Revises: 0012_progress_ocr
Create Date: 2026-09-26

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0013_video_session_tracking"
down_revision: str | None = "0012_progress_ocr"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table("video_sessions") as batch_op:
        batch_op.add_column(sa.Column("external_session_id", sa.String(length=255), nullable=True))
        batch_op.create_index("ix_video_sessions_external_session_id", ["external_session_id"])


def downgrade() -> None:
    with op.batch_alter_table("video_sessions") as batch_op:
        batch_op.drop_index("ix_video_sessions_external_session_id")
        batch_op.drop_column("external_session_id")
