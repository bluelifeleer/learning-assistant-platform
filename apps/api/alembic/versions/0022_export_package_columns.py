"""导出任务:补进度/错误/体积/对象统计,并为 .lapkg 完整包做准备

原来 exports 只有 status 和 file_path,导出中心无法展示体积与内容规模,
异步化后也需要 progress / error 字段。

Revision ID: 0022_export_package_columns
Revises: 0021_audit_log_columns
Create Date: 2026-10-28

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0022_export_package_columns"
down_revision: str | None = "0021_audit_log_columns"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table("exports") as batch:
        batch.add_column(sa.Column("progress", sa.Integer(), nullable=False, server_default=sa.text("0")))
        batch.add_column(sa.Column("error", sa.Text(), nullable=True))
        batch.add_column(sa.Column("size_bytes", sa.Integer(), nullable=True))
        batch.add_column(sa.Column("scope_counts", sa.JSON(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("exports") as batch:
        batch.drop_column("scope_counts")
        batch.drop_column("size_bytes")
        batch.drop_column("error")
        batch.drop_column("progress")
