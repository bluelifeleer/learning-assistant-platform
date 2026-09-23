from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa

revision: str = "0010_ai_features"
down_revision: str | None = "0009_note_tags"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

ID = sa.String(length=36)
JSON = sa.JSON()


def upgrade() -> None:
    op.add_column("organizations", sa.Column("llm_base_url", sa.String(length=500), nullable=True))
    op.add_column("organizations", sa.Column("llm_api_key", sa.String(length=500), nullable=True))
    op.add_column("organizations", sa.Column("llm_model", sa.String(length=120), nullable=True))
    op.add_column("organizations", sa.Column("ai_auto_generate", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.create_table(
        "chapter_summaries",
        sa.Column("id", ID, primary_key=True),
        sa.Column("chapter_id", ID, sa.ForeignKey("chapters.id"), nullable=False, unique=True),
        sa.Column("course_id", ID, sa.ForeignKey("courses.id"), nullable=False),
        sa.Column("summary_md", sa.Text(), nullable=False),
        sa.Column("outline", JSON, nullable=False),
        sa.Column("key_points", JSON, nullable=False),
        sa.Column("model", sa.String(length=120), nullable=False),
        sa.Column("status", sa.String(length=40), nullable=False),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_table(
        "course_summaries",
        sa.Column("id", ID, primary_key=True),
        sa.Column("course_id", ID, sa.ForeignKey("courses.id"), nullable=False, unique=True),
        sa.Column("summary_md", sa.Text(), nullable=False),
        sa.Column("outline", JSON, nullable=False),
        sa.Column("key_points", JSON, nullable=False),
        sa.Column("model", sa.String(length=120), nullable=False),
        sa.Column("status", sa.String(length=40), nullable=False),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_table(
        "quiz_questions",
        sa.Column("id", ID, primary_key=True),
        sa.Column("course_id", ID, sa.ForeignKey("courses.id"), nullable=False),
        sa.Column("chapter_id", ID, sa.ForeignKey("chapters.id"), nullable=False),
        sa.Column("question_type", sa.String(length=40), nullable=False),
        sa.Column("question", sa.Text(), nullable=False),
        sa.Column("options", JSON, nullable=False),
        sa.Column("answer", sa.Text(), nullable=False),
        sa.Column("explanation", sa.Text(), nullable=True),
        sa.Column("model", sa.String(length=120), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_quiz_questions_chapter_id", "quiz_questions", ["chapter_id"])
    op.create_index("ix_quiz_questions_course_id", "quiz_questions", ["course_id"])
    op.create_table(
        "ai_tasks",
        sa.Column("id", ID, primary_key=True),
        sa.Column("organization_id", ID, sa.ForeignKey("organizations.id"), nullable=False),
        sa.Column("task_type", sa.String(length=40), nullable=False),
        sa.Column("course_id", ID, sa.ForeignKey("courses.id"), nullable=False),
        sa.Column("chapter_id", ID, sa.ForeignKey("chapters.id"), nullable=True),
        sa.Column("status", sa.String(length=40), nullable=False),
        sa.Column("result_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_ai_tasks_chapter_id", "ai_tasks", ["chapter_id"])


def downgrade() -> None:
    op.drop_index("ix_ai_tasks_chapter_id", table_name="ai_tasks")
    op.drop_table("ai_tasks")
    op.drop_index("ix_quiz_questions_course_id", table_name="quiz_questions")
    op.drop_index("ix_quiz_questions_chapter_id", table_name="quiz_questions")
    op.drop_table("quiz_questions")
    op.drop_table("course_summaries")
    op.drop_table("chapter_summaries")
    op.drop_column("organizations", "ai_auto_generate")
    op.drop_column("organizations", "llm_model")
    op.drop_column("organizations", "llm_api_key")
    op.drop_column("organizations", "llm_base_url")
