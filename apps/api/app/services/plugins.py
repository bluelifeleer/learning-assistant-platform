from datetime import UTC, datetime, timedelta
from hashlib import sha256
from secrets import token_urlsafe

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.models.entities import ApiToken, Organization, PluginClient
from app.schemas.plugins import PluginClientOut, PluginHeartbeatIn, PluginHeartbeatOut, PluginStatusOut, PluginTokenCreateOut

ONLINE_WINDOW = timedelta(minutes=2)


def hash_plugin_token(token: str) -> str:
    pepper = get_settings().api_token_pepper
    return sha256(f"{pepper}:{token}".encode("utf-8")).hexdigest()


def ensure_default_organization(db: Session) -> Organization:
    organization = db.query(Organization).first()
    if organization:
        return organization
    organization = Organization(name=get_settings().default_org_name, plan="local", license_status="inactive")
    db.add(organization)
    db.flush()
    return organization


def client_out(client: PluginClient, now: datetime | None = None) -> PluginClientOut:
    current_time = now or datetime.now(UTC)
    last_seen = client.last_seen_at
    if last_seen and last_seen.tzinfo is None:
        last_seen = last_seen.replace(tzinfo=UTC)
    online = bool(last_seen and current_time - last_seen <= ONLINE_WINDOW)
    return PluginClientOut(
        id=client.id,
        name=client.name,
        online=online,
        extension_version=client.extension_version,
        current_url=client.current_url,
        adapter_id=client.adapter_id,
        adapter_name=client.adapter_name,
        enabled_adapters=client.enabled_adapters or [],
        last_seen_at=client.last_seen_at,
    )


class PluginService:
    def __init__(self, db: Session):
        self.db = db

    def create_token(self, name: str) -> PluginTokenCreateOut:
        organization = ensure_default_organization(self.db)
        plain_token = f"lap_{token_urlsafe(32)}"
        token = ApiToken(
            organization_id=organization.id,
            user_id=None,
            token_hash=hash_plugin_token(plain_token),
            name=name,
        )
        self.db.add(token)
        self.db.flush()
        client = PluginClient(
            organization_id=organization.id,
            token_id=token.id,
            name=name,
            enabled_adapters=["wencai-school", "generic-video"],
        )
        self.db.add(client)
        self.db.commit()
        self.db.refresh(client)
        return PluginTokenCreateOut(token=plain_token, client=client_out(client))

    def heartbeat(self, bearer_token: str, payload: PluginHeartbeatIn) -> PluginHeartbeatOut:
        token_hash = hash_plugin_token(bearer_token)
        token = self.db.query(ApiToken).filter(ApiToken.token_hash == token_hash, ApiToken.revoked_at.is_(None)).first()
        if not token:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid plugin token")
        client = self.db.query(PluginClient).filter(PluginClient.token_id == token.id).first()
        if not client:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Plugin client not found")
        now = datetime.now(UTC)
        token.last_used_at = now
        client.extension_version = payload.extension_version
        client.current_url = payload.current_url
        client.adapter_id = payload.adapter_id
        client.adapter_name = payload.adapter_name
        client.enabled_adapters = payload.enabled_adapters
        client.last_seen_at = now
        self.db.commit()
        self.db.refresh(client)
        return PluginHeartbeatOut(status="online", client=client_out(client, now=now))

    def status(self) -> PluginStatusOut:
        clients = self.db.query(PluginClient).order_by(PluginClient.created_at.desc()).all()
        return PluginStatusOut(clients=[client_out(client) for client in clients])
