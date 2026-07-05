from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa

revision: str = "0003_usernames"
down_revision: str | None = "0002_plugin_clients"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table("users") as batch_op:
        batch_op.add_column(sa.Column("username", sa.String(length=50), nullable=True))
        batch_op.create_unique_constraint("uq_users_username", ["username"])


def downgrade() -> None:
    with op.batch_alter_table("users") as batch_op:
        batch_op.drop_constraint("uq_users_username", type_="unique")
        batch_op.drop_column("username")
