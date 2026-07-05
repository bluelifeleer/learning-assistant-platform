from datetime import datetime

from pydantic import BaseModel, Field


class PluginTokenCreateIn(BaseModel):
    name: str = Field(default="Chrome extension", min_length=1, max_length=120)


class PluginClientOut(BaseModel):
    id: str
    name: str
    online: bool
    extension_version: str | None = None
    current_url: str | None = None
    adapter_id: str | None = None
    adapter_name: str | None = None
    enabled_adapters: list[str] = []
    last_seen_at: datetime | None = None


class PluginTokenCreateOut(BaseModel):
    token: str
    client: PluginClientOut


class PluginHeartbeatIn(BaseModel):
    extension_version: str | None = None
    current_url: str | None = None
    adapter_id: str | None = None
    adapter_name: str | None = None
    enabled_adapters: list[str] = []


class PluginHeartbeatOut(BaseModel):
    status: str
    client: PluginClientOut


class PluginStatusOut(BaseModel):
    clients: list[PluginClientOut]
