from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa

revision: str = "0008_note_corrections"
down_revision: str | None = "0007_note_images"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("notes", sa.Column("corrected_content", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("notes", "corrected_content")
