from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.entities import Site
from app.schemas.workspace import AdapterItem, AdapterListOut

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
