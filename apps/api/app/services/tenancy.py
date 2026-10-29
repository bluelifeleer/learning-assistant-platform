"""组织边界助手。

导出、导入、测验题管理这些「按组织隔离」的接口都要用到同一套规则，集中放在这里，
避免每个路由各写一份（历史上 exports.py 里那份就被 imports.py 反向 import）。
"""

from __future__ import annotations

from sqlalchemy.orm import Session

from app.models.entities import Course, Membership, Organization, User
from app.services.plugins import ensure_default_organization


def organization_for_user(db: Session, user: User) -> Organization:
    """当前用户所属组织；没有成员关系时退回默认组织。"""
    membership = db.query(Membership).filter(Membership.user_id == user.id).first()
    if membership:
        organization = db.get(Organization, membership.organization_id)
        if organization:
            return organization
    return ensure_default_organization(db)


def course_in_org(db: Session, course_id: str, organization: Organization) -> Course | None:
    """按 id 取课程，并确认它属于该组织；不属于时返回 None（调用方转 404）。"""
    return (
        db.query(Course)
        .filter(Course.id == course_id, Course.organization_id == organization.id)
        .first()
    )
