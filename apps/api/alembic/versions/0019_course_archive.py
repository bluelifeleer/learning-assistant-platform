"""课程归档字段

课程下挂着章节 / 字幕 / 笔记 / 截图 / 会话,物理删除的级联代价太大,
所以用 archived_at 归档:列表默认不显示,需要时可取消归档。

Revision ID: 0019_course_archive
Revises: 0018_watch_time_accumulation
Create Date: 2026-09-27

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0019_course_archive"
down_revision: str | None = "0018_watch_time_accumulation"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("courses", sa.Column("archived_at", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column("courses", "archived_at")
