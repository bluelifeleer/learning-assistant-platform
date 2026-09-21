from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa

revision: str = "0005_review_cards"
down_revision: str | None = "0004_video_capture_events"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

ID = sa.String(length=36)


def upgrade() -> None:
    op.create_table(
        "review_cards",
        sa.Column("id", ID, primary_key=True),
        sa.Column("organization_id", ID, sa.ForeignKey("organizations.id"), nullable=False),
        sa.Column("note_id", ID, sa.ForeignKey("notes.id"), nullable=True),
        sa.Column("course_id", ID, sa.ForeignKey("courses.id"), nullable=False),
        sa.Column("chapter_id", ID, sa.ForeignKey("chapters.id"), nullable=True),
        sa.Column("user_id", ID, sa.ForeignKey("users.id"), nullable=False),
        sa.Column("front", sa.Text(), nullable=False),
        sa.Column("back", sa.Text(), nullable=False),
        sa.Column("ease_factor", sa.Float(), nullable=False, server_default="2.5"),
        sa.Column("interval_days", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("due_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("review_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_review_cards_due_at", "review_cards", ["due_at"])
    op.create_table(
        "review_logs",
        sa.Column("id", ID, primary_key=True),
        sa.Column("card_id", ID, sa.ForeignKey("review_cards.id"), nullable=False),
        sa.Column("result", sa.String(length=20), nullable=False),
        sa.Column("reviewed_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_review_logs_card_id", "review_logs", ["card_id"])


def downgrade() -> None:
    op.drop_index("ix_review_logs_card_id", table_name="review_logs")
    op.drop_table("review_logs")
    op.drop_index("ix_review_cards_due_at", table_name="review_cards")
    op.drop_table("review_cards")
