"""审计日志:谁在什么时候做了什么。

存在意义:此前 `audit_logs` 表建好了但**没有任何代码写入**,导致
「密码为什么突然变了」「这个课程是谁归档的」这类问题完全无法追溯,
只能靠猜。关键动作从这里统一落库。

约定:record() 只把记录加进 session,**不提交**,由调用方决定事务边界;
需要"即使后续报错也要留下痕迹"的场景(如登录失败),调用方在抛出前显式 commit。
"""

from __future__ import annotations

from typing import Any

from sqlalchemy.orm import Session

from app.models.entities import AuditLog

# 动作名集中定义,避免各处手写字符串拼错
LOGIN_SUCCESS = "login_success"
LOGIN_FAILED = "login_failed"
PASSWORD_CHANGED = "password_changed"
USER_REGISTERED = "user_registered"
SETUP_ADMIN_CREATED = "setup_admin_created"
PROFILE_UPDATED = "profile_updated"
COURSE_UPDATED = "course_updated"
NOTE_DELETED = "note_deleted"
NOTES_BULK_DELETED = "notes_bulk_deleted"
NOTES_BULK_TAGGED = "notes_bulk_tagged"
REVIEW_CARD_UPDATED = "review_card_updated"
REVIEW_CARD_DELETED = "review_card_deleted"
IMPORT_CREATED = "import_created"
IMPORT_COMPLETED = "import_completed"
IMPORT_FAILED = "import_failed"
EXPORT_CREATED = "export_created"
EXPORT_FAILED = "export_failed"


def record(
    db: Session,
    action: str,
    *,
    resource_type: str | None = None,
    resource_id: str | None = None,
    user_id: str | None = None,
    organization_id: str | None = None,
    payload: dict[str, Any] | None = None,
) -> AuditLog:
    """追加一条审计记录(不提交)。"""
    entry = AuditLog(
        action=action,
        resource_type=resource_type,
        resource_id=resource_id,
        user_id=user_id,
        organization_id=organization_id,
        payload=payload or {},
    )
    db.add(entry)
    return entry
