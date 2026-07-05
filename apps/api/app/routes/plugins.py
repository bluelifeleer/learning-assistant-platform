from io import BytesIO
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile

from fastapi import APIRouter, Depends
from fastapi.responses import Response
from sqlalchemy.orm import Session

from app.core.deps import require_bearer_token
from app.db.session import get_db
from app.schemas.plugins import PluginHeartbeatIn, PluginHeartbeatOut, PluginStatusOut, PluginTokenCreateIn, PluginTokenCreateOut
from app.services.plugins import PluginService

router = APIRouter(tags=["plugins"])


def extension_root() -> Path:
    return Path(__file__).resolve().parents[3] / "extension"


def build_extension_zip(root: Path | None = None) -> bytes:
    source_root = root or extension_root()
    required_files = [
        source_root / "manifest.json",
        source_root / "options.html",
        source_root / "dist" / "content.js",
        source_root / "dist" / "background.js",
        source_root / "dist" / "options.js",
    ]
    missing = [str(path.relative_to(source_root)) for path in required_files if not path.exists()]
    if missing:
        raise FileNotFoundError(f"Extension build is missing: {', '.join(missing)}")

    buffer = BytesIO()
    with ZipFile(buffer, "w", ZIP_DEFLATED) as archive:
        for path in required_files:
            archive.write(path, path.relative_to(source_root).as_posix())
    return buffer.getvalue()


def get_plugin_service(db: Session = Depends(get_db)) -> PluginService:
    return PluginService(db)


@router.post("/plugin-tokens", response_model=PluginTokenCreateOut)
def create_plugin_token(payload: PluginTokenCreateIn, service: PluginService = Depends(get_plugin_service)) -> PluginTokenCreateOut:
    return service.create_token(payload.name)


@router.get("/plugin-status", response_model=PluginStatusOut)
def plugin_status(service: PluginService = Depends(get_plugin_service)) -> PluginStatusOut:
    return service.status()


@router.get("/plugin-package")
def plugin_package() -> Response:
    return Response(
        content=build_extension_zip(),
        media_type="application/zip",
        headers={"content-disposition": 'attachment; filename="learning-assistant-extension.zip"'},
    )


@router.post("/plugin-heartbeat", response_model=PluginHeartbeatOut)
def plugin_heartbeat(
    payload: PluginHeartbeatIn,
    token: str = Depends(require_bearer_token),
    service: PluginService = Depends(get_plugin_service),
) -> PluginHeartbeatOut:
    return service.heartbeat(token, payload)
