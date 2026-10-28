"""导入任务表

与 ai_tasks 相同的思路：请求里只落一条任务记录，真正的解析与落库由后台任务做，
前端轮询进度。dry_run 也走同一条链路，只是不写业务数据。

Revision ID: 0023_import_jobs
Revises: 0022_export_package_columns
Create Date: 2026-10-28

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0023_import_jobs"
down_revision: str | None = "0022_export_package_columns"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "import_jobs",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("organization_id", sa.String(length=36), sa.ForeignKey("organizations.id"), nullable=False),
        sa.Column("user_id", sa.String(length=36), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("source_filename", sa.String(length=255), nullable=False),
        sa.Column("size_bytes", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("checksum", sa.String(length=80), nullable=True),
        sa.Column("strategy", sa.String(length=20), nullable=False, server_default="merge"),
        sa.Column("dry_run", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("status", sa.String(length=40), nullable=False, server_default="queued"),
        sa.Column("progress", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("stats", sa.JSON(), nullable=True),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_import_jobs_org_created", "import_jobs", ["organization_id", "created_at"])


def downgrade() -> None:
    op.drop_index("ix_import_jobs_org_created", table_name="import_jobs")
    op.drop_table("import_jobs")
