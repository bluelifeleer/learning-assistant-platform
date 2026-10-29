"""导入任务支持指定目标课程

Anki TSV / CSV 这类没有课程结构的来源，此前只能落到按来源命名的合成课程里。
加一列记下用户选择的已有课程，导入时把卡片/笔记直接挂上去。

Revision ID: 0024_import_target_course
Revises: 0023_import_jobs
Create Date: 2026-10-29

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0024_import_target_course"
down_revision: str | None = "0023_import_jobs"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table("import_jobs") as batch:
        batch.add_column(sa.Column("target_course_id", sa.String(length=36), nullable=True))
        batch.create_foreign_key(
            "fk_import_jobs_target_course",
            "courses",
            ["target_course_id"],
            ["id"],
        )


def downgrade() -> None:
    with op.batch_alter_table("import_jobs") as batch:
        batch.drop_constraint("fk_import_jobs_target_course", type_="foreignkey")
        batch.drop_column("target_course_id")
