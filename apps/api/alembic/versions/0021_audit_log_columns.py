"""审计日志:允许匿名记录并补查询索引

登录失败时账号可能不存在,user_id 必须可空,否则记不下来 ——
而"有人用错账号试图登录"恰恰是排查登录问题最需要的信息。

Revision ID: 0021_audit_log_columns
Revises: 0020_review_card_suspended
Create Date: 2026-09-27

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0021_audit_log_columns"
down_revision: str | None = "0020_review_card_suspended"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    # SQLite 不支持 ALTER COLUMN,用 batch 模式:PG 直接 ALTER,SQLite 重建表
    with op.batch_alter_table("audit_logs") as batch:
        batch.alter_column("user_id", existing_type=sa.String(length=36), nullable=True)
    op.create_index("ix_audit_logs_action_created", "audit_logs", ["action", "created_at"])
    op.create_index("ix_audit_logs_user_created", "audit_logs", ["user_id", "created_at"])


def downgrade() -> None:
    op.drop_index("ix_audit_logs_user_created", table_name="audit_logs")
    op.drop_index("ix_audit_logs_action_created", table_name="audit_logs")
    with op.batch_alter_table("audit_logs") as batch:
        batch.alter_column("user_id", existing_type=sa.String(length=36), nullable=False)
