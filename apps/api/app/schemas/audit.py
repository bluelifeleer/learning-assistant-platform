from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


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


class AuditLogBulkIdsIn(BaseModel):
    """批量清理选中的审计记录 id。"""

    ids: list[str] = Field(min_length=1, max_length=500)


class AuditLogBulkResultOut(BaseModel):
    affected: int
