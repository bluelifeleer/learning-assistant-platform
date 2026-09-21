from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa

revision: str = "0007_note_images"
down_revision: str | None = "0006_screenshots"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

ID = sa.String(length=36)


def upgrade() -> None:
    op.create_table(
        "note_images",
        sa.Column("id", ID, primary_key=True),
        sa.Column("organization_id", ID, sa.ForeignKey("organizations.id"), nullable=False),
        sa.Column("user_id", ID, sa.ForeignKey("users.id"), nullable=False),
        sa.Column("file_path", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_note_images_user_id", "note_images", ["user_id"])


def downgrade() -> None:
    op.drop_index("ix_note_images_user_id", table_name="note_images")
    op.drop_table("note_images")
