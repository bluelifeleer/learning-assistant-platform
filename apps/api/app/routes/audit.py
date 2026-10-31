from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.core.deps import require_owner
from app.db.session import get_db
from app.models.entities import AuditLog, User
from app.schemas.audit import (
    AuditLogBulkIdsIn,
    AuditLogBulkResultOut,
    AuditLogItem,
    AuditLogListOut,
)
from app.services import audit

router = APIRouter(prefix="/audit-logs", tags=["audit"])


def _as_utc(value: datetime | None) -> datetime | None:
    """SQLite 里存的是无时区的 UTC 时间,PG 是 timestamptz。
    统一折算成 UTC 再比较,避免前端传 +08:00 时在两种库上出现 8 小时偏移。"""
    if value is None:
        return None
    return value.replace(tzinfo=UTC) if value.tzinfo is None else value.astimezone(UTC)


def _serialize_time(value: datetime | None) -> datetime | None:
    """同样把 SQLite 取出的 naive 时间标成 UTC,前端 new Date() 才能正确换成本地时间。"""
    if value is None:
        return None
    return value.replace(tzinfo=UTC) if value.tzinfo is None else value


@router.get("", response_model=AuditLogListOut)
def list_audit_logs(
    action: str | None = Query(default=None, description="按动作过滤,如 login_failed"),
    start: datetime | None = Query(default=None, description="起始时间(含),ISO 8601"),
    end: datetime | None = Query(default=None, description="结束时间(含),ISO 8601"),
    limit: int = Query(default=100, ge=1, le=500),
    _: User = Depends(require_owner),
    db: Session = Depends(get_db),
) -> AuditLogListOut:
    """最近的审计记录(仅 owner 可见)。

    排查"密码为什么变了""谁删了笔记"时,先看 password_changed / login_failed。
    start / end 用于按时间范围排查,例如"10 月 30 日那天谁登录过"。
    """
    start_utc = _as_utc(start)
    end_utc = _as_utc(end)
    if start_utc and end_utc and start_utc > end_utc:
        raise HTTPException(status_code=400, detail="开始时间不能晚于结束时间")

    query = db.query(AuditLog).order_by(AuditLog.created_at.desc())
    if action:
        query = query.filter(AuditLog.action == action)
    if start_utc:
        query = query.filter(AuditLog.created_at >= start_utc)
    if end_utc:
        query = query.filter(AuditLog.created_at <= end_utc)
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
                created_at=_serialize_time(log.created_at),
            )
            for log in logs
        ]
    )


@router.post("/bulk-delete", response_model=AuditLogBulkResultOut)
def bulk_delete_audit_logs(
    payload: AuditLogBulkIdsIn,
    user: User = Depends(require_owner),
    db: Session = Depends(get_db),
) -> AuditLogBulkResultOut:
    """批量删除审计记录(仅 owner)。

    清理动作本身也会写一条 audit_logs_deleted,保留"谁在什么时候清了多少条"
    的痕迹;新记录不会落在本次删除的 id 里。
    """
    logs = db.query(AuditLog).filter(AuditLog.id.in_(payload.ids)).all()
    ids = [log.id for log in logs]
    if not ids:
        return AuditLogBulkResultOut(affected=0)

    times = sorted(log.created_at for log in logs if log.created_at)
    for log in logs:
        db.delete(log)
    audit.record(
        db,
        audit.AUDIT_LOGS_DELETED,
        resource_type="audit_log",
        resource_id="bulk",
        user_id=user.id,
        payload={
            "count": len(ids),
            "oldest": _serialize_time(times[0]).isoformat() if times else None,
            "newest": _serialize_time(times[-1]).isoformat() if times else None,
        },
    )
    db.commit()
    return AuditLogBulkResultOut(affected=len(ids))
