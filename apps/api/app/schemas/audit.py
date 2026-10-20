from datetime import datetime
from typing import Any

from pydantic import BaseModel


class AuditLogItem(BaseModel):
    id: str
    action: str
    resource_type: str | None = None
    resource_id: str | None = None
    user_id: str | None = None
    user_email: str | None = None
    organization_id: str | None = None
    payload: dict[str, Any] = {}
    created_at: datetime | None = None


class AuditLogListOut(BaseModel):
    items: list[AuditLogItem]
