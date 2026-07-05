from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.db.session import get_db
from app.schemas.workspace import WorkspaceSettingsOut, WorkspaceSettingsUpdateIn
from app.services.plugins import ensure_default_organization

router = APIRouter(prefix="/settings", tags=["settings"])


def settings_out(db: Session) -> WorkspaceSettingsOut:
    config = get_settings()
    organization = ensure_default_organization(db)
    return WorkspaceSettingsOut(
        organization_name=organization.name,
        plan=organization.plan,
        license_key=organization.license_key,
        license_status=organization.license_status,
        api_base_url=f"http://{config.api_host}:{config.api_port}/api/v1",
        database_type=config.database_type,
        export_dir=config.export_dir,
    )


@router.get("", response_model=WorkspaceSettingsOut)
def read_settings(db: Session = Depends(get_db)) -> WorkspaceSettingsOut:
    return settings_out(db)


@router.put("", response_model=WorkspaceSettingsOut)
def update_settings(payload: WorkspaceSettingsUpdateIn, db: Session = Depends(get_db)) -> WorkspaceSettingsOut:
    organization = ensure_default_organization(db)
    if payload.organization_name is not None:
        organization.name = payload.organization_name
    if payload.license_key is not None:
        organization.license_key = payload.license_key or None
        organization.license_status = "active" if organization.license_key else "inactive"
    db.commit()
    return settings_out(db)
