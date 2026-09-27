"""复习卡片暂停字段

暂停的卡片不再进入「今日待复习」,但保留记录以便恢复。

Revision ID: 0020_review_card_suspended
Revises: 0019_course_archive
Create Date: 2026-09-27

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0020_review_card_suspended"
down_revision: str | None = "0019_course_archive"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "review_cards",
        sa.Column("suspended", sa.Boolean(), nullable=False, server_default=sa.text("false")),
    )


def downgrade() -> None:
    op.drop_column("review_cards", "suspended")
