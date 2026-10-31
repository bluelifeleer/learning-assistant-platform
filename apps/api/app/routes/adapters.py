from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.deps import require_current_user
from app.db.session import get_db
from app.models.entities import Course, Site, User
from app.schemas.workspace import (
    AdapterDeleteOut,
    AdapterItem,
    AdapterListOut,
    AdapterSaveIn,
    AdapterUpdateIn,
)
from app.services import audit

router = APIRouter(prefix="/adapters", tags=["adapters"])


@router.get("", response_model=AdapterListOut)
def list_adapters(_: User = Depends(require_current_user), db: Session = Depends(get_db)) -> AdapterListOut:
    sites = db.query(Site).order_by(Site.name.asc()).all()
    return AdapterListOut(
        items=[
            AdapterItem(id=site.id, adapter_id=site.adapter_id, name=site.name, status=site.status, host_patterns=site.host_patterns or {})
            for site in sites
        ]
    )


def adapter_out(site: Site) -> AdapterItem:
    return AdapterItem(id=site.id, adapter_id=site.adapter_id, name=site.name, status=site.status, host_patterns=site.host_patterns or {})


@router.post("", response_model=AdapterItem)
def save_adapter(payload: AdapterSaveIn, _: User = Depends(require_current_user), db: Session = Depends(get_db)) -> AdapterItem:
    site = db.query(Site).filter(Site.adapter_id == payload.adapter_id).first()
    if not site:
        site = Site(adapter_id=payload.adapter_id, name=payload.name, status=payload.status, host_patterns=payload.host_patterns)
        db.add(site)
    else:
        site.name = payload.name
        site.status = payload.status
        site.host_patterns = payload.host_patterns
    db.commit()
    db.refresh(site)
    return adapter_out(site)


@router.put("/{adapter_id}", response_model=AdapterItem)
def update_adapter(adapter_id: str, payload: AdapterUpdateIn, _: User = Depends(require_current_user), db: Session = Depends(get_db)) -> AdapterItem:
    site = db.query(Site).filter(Site.adapter_id == adapter_id).first()
    if not site:
        site = Site(adapter_id=adapter_id, name=payload.name or adapter_id, status=payload.status or "enabled", host_patterns=payload.host_patterns or {})
        db.add(site)
    else:
        if payload.name is not None:
            site.name = payload.name
        if payload.status is not None:
            site.status = payload.status
        if payload.host_patterns is not None:
            site.host_patterns = payload.host_patterns
    db.commit()
    db.refresh(site)
    return adapter_out(site)


@router.delete("/{adapter_id}", response_model=AdapterDeleteOut)
def delete_adapter(
    adapter_id: str,
    user: User = Depends(require_current_user),
    db: Session = Depends(get_db),
) -> AdapterDeleteOut:
    """删除适配器。

    适配器是课程的外键来源:如果它下面还挂着课程,直接删会让课程悬空,
    所以先拦截并告诉用户还剩多少门课程,让用户先去课程页清理。
    """
    site = db.query(Site).filter(Site.adapter_id == adapter_id).first()
    if not site:
        raise HTTPException(status_code=404, detail="适配器不存在")

    course_count = db.query(Course).filter(Course.site_id == site.id).count()
    if course_count:
        raise HTTPException(
            status_code=409,
            detail=f"该适配器下还有 {course_count} 门课程，请先删除课程后再删适配器",
        )

    name = site.name
    db.delete(site)
    audit.record(
        db,
        audit.ADAPTER_DELETED,
        resource_type="adapter",
        resource_id=adapter_id,
        user_id=user.id,
        payload={"adapter_id": adapter_id, "name": name},
    )
    db.commit()
    return AdapterDeleteOut(deleted=1)
