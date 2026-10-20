from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.deps import require_owner
from app.db.session import get_db
from app.models.entities import AuditLog, User
from app.schemas.audit import AuditLogItem, AuditLogListOut

router = APIRouter(prefix="/audit-logs", tags=["audit"])


@router.get("", response_model=AuditLogListOut)
def list_audit_logs(
    action: str | None = Query(default=None, description="按动作过滤,如 login_failed"),
    limit: int = Query(default=100, ge=1, le=500),
    _: User = Depends(require_owner),
    db: Session = Depends(get_db),
) -> AuditLogListOut:
    """最近的审计记录(仅 owner 可见)。

    排查"密码为什么变了""谁删了笔记"时,先看 password_changed / login_failed。
    """
    query = db.query(AuditLog).order_by(AuditLog.created_at.desc())
    if action:
        query = query.filter(AuditLog.action == action)
    logs = query.limit(limit).all()

    user_ids = {log.user_id for log in logs if log.user_id}
    emails = (
        {row.id: row.email for row in db.query(User.id, User.email).filter(User.id.in_(user_ids)).all()}
        if user_ids
        else {}
    )
    return AuditLogListOut(
        items=[
            AuditLogItem(
                id=log.id,
                action=log.action,
                resource_type=log.resource_type,
                resource_id=log.resource_id,
                user_id=log.user_id,
                user_email=emails.get(log.user_id) if log.user_id else None,
                organization_id=log.organization_id,
                payload=log.payload or {},
                created_at=log.created_at,
            )
            for log in logs
        ]
    )
