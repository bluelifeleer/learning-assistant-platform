from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.entities import Site
from app.schemas.workspace import AdapterItem, AdapterListOut, AdapterSaveIn, AdapterUpdateIn

router = APIRouter(prefix="/adapters", tags=["adapters"])


@router.get("", response_model=AdapterListOut)
def list_adapters(db: Session = Depends(get_db)) -> AdapterListOut:
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
def save_adapter(payload: AdapterSaveIn, db: Session = Depends(get_db)) -> AdapterItem:
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
def update_adapter(adapter_id: str, payload: AdapterUpdateIn, db: Session = Depends(get_db)) -> AdapterItem:
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
