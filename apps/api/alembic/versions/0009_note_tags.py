from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa

revision: str = "0009_note_tags"
down_revision: str | None = "0008_note_corrections"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("notes", sa.Column("tags", sa.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_column("notes", "tags")
