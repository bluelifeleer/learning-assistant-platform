"""add token expiry

Revision ID: 0014_token_expiry
Revises: 0013_video_session_tracking
Create Date: 2026-09-26

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0014_token_expiry"
down_revision: str | None = "0013_video_session_tracking"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table("api_tokens") as batch_op:
        batch_op.add_column(sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("api_tokens") as batch_op:
        batch_op.drop_column("expires_at")
