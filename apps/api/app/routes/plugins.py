from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.deps import require_bearer_token
from app.db.session import get_db
from app.schemas.plugins import PluginHeartbeatIn, PluginHeartbeatOut, PluginStatusOut, PluginTokenCreateIn, PluginTokenCreateOut
from app.services.plugins import PluginService

router = APIRouter(tags=["plugins"])


def get_plugin_service(db: Session = Depends(get_db)) -> PluginService:
    return PluginService(db)


@router.post("/plugin-tokens", response_model=PluginTokenCreateOut)
def create_plugin_token(payload: PluginTokenCreateIn, service: PluginService = Depends(get_plugin_service)) -> PluginTokenCreateOut:
    return service.create_token(payload.name)


@router.get("/plugin-status", response_model=PluginStatusOut)
def plugin_status(service: PluginService = Depends(get_plugin_service)) -> PluginStatusOut:
    return service.status()


@router.post("/plugin-heartbeat", response_model=PluginHeartbeatOut)
def plugin_heartbeat(
    payload: PluginHeartbeatIn,
    token: str = Depends(require_bearer_token),
    service: PluginService = Depends(get_plugin_service),
) -> PluginHeartbeatOut:
    return service.heartbeat(token, payload)
