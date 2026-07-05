from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa

revision: str = "0002_plugin_clients"
down_revision: str | None = "0001_initial"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

ID = sa.String(length=36)
JSON = sa.JSON()


def upgrade() -> None:
    op.create_table(
        "plugin_clients",
        sa.Column("id", ID, primary_key=True),
        sa.Column("organization_id", ID, sa.ForeignKey("organizations.id"), nullable=False),
        sa.Column("token_id", ID, sa.ForeignKey("api_tokens.id"), nullable=False, unique=True),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("extension_version", sa.String(length=40), nullable=True),
        sa.Column("current_url", sa.Text(), nullable=True),
        sa.Column("adapter_id", sa.String(length=120), nullable=True),
        sa.Column("adapter_name", sa.String(length=200), nullable=True),
        sa.Column("enabled_adapters", JSON, nullable=False),
        sa.Column("last_seen_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("plugin_clients")
