from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa

revision: str = "0011_mastery_email"
down_revision: str | None = "0010_ai_features"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

ID = sa.String(length=36)


def upgrade() -> None:
    op.add_column("organizations", sa.Column("smtp_host", sa.String(length=200), nullable=True))
    op.add_column("organizations", sa.Column("smtp_port", sa.Integer(), nullable=False, server_default="465"))
    op.add_column("organizations", sa.Column("smtp_username", sa.String(length=200), nullable=True))
    op.add_column("organizations", sa.Column("smtp_password", sa.String(length=500), nullable=True))
    op.add_column("organizations", sa.Column("email_from", sa.String(length=320), nullable=True))
    op.add_column("organizations", sa.Column("email_to", sa.String(length=320), nullable=True))
    op.add_column("organizations", sa.Column("digest_auto", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column("organizations", sa.Column("digest_frequency", sa.String(length=20), nullable=False, server_default="daily"))
    op.add_column("organizations", sa.Column("digest_hour", sa.Integer(), nullable=False, server_default="8"))
    op.add_column("organizations", sa.Column("last_digest_at", sa.DateTime(timezone=True), nullable=True))
    op.create_table(
        "quiz_attempts",
        sa.Column("id", ID, primary_key=True),
        sa.Column("organization_id", ID, sa.ForeignKey("organizations.id"), nullable=False),
        sa.Column("user_id", ID, sa.ForeignKey("users.id"), nullable=False),
        sa.Column("question_id", ID, sa.ForeignKey("quiz_questions.id"), nullable=False),
        sa.Column("course_id", ID, sa.ForeignKey("courses.id"), nullable=False),
        sa.Column("chapter_id", ID, sa.ForeignKey("chapters.id"), nullable=False),
        sa.Column("chosen", sa.Text(), nullable=False),
        sa.Column("correct", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_quiz_attempts_user_id", "quiz_attempts", ["user_id"])
    op.create_index("ix_quiz_attempts_chapter_id", "quiz_attempts", ["chapter_id"])
    with op.batch_alter_table("ai_tasks") as batch_op:
        batch_op.alter_column("course_id", existing_type=ID, nullable=True)


def downgrade() -> None:
    with op.batch_alter_table("ai_tasks") as batch_op:
        batch_op.alter_column("course_id", existing_type=ID, nullable=False)
    op.drop_index("ix_quiz_attempts_chapter_id", table_name="quiz_attempts")
    op.drop_index("ix_quiz_attempts_user_id", table_name="quiz_attempts")
    op.drop_table("quiz_attempts")
    op.drop_column("organizations", "last_digest_at")
    op.drop_column("organizations", "digest_hour")
    op.drop_column("organizations", "digest_frequency")
    op.drop_column("organizations", "digest_auto")
    op.drop_column("organizations", "email_to")
    op.drop_column("organizations", "email_from")
    op.drop_column("organizations", "smtp_password")
    op.drop_column("organizations", "smtp_username")
    op.drop_column("organizations", "smtp_port")
    op.drop_column("organizations", "smtp_host")
