"""学习时长改为按进度增量累加

duration_watched_seconds 从「视频最远进度」改成「实际观看时长」,
需要记录上一次上报的位置与时间来算增量。

Revision ID: 0018_watch_time_accumulation
Revises: 0017_perf_indexes
Create Date: 2026-09-27

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0018_watch_time_accumulation"
down_revision: str | None = "0017_perf_indexes"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("video_sessions", sa.Column("last_position_seconds", sa.Numeric(10, 3), nullable=True))
    op.add_column("video_sessions", sa.Column("last_event_at", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column("video_sessions", "last_event_at")
    op.drop_column("video_sessions", "last_position_seconds")
