import ipaddress

from fastapi import APIRouter, Depends, HTTPException, Request, status

from app.schemas.setup import DatabaseConfigIn, DatabaseTestOut, SetupInitializeIn, SetupStatusOut
from app.services.setup import build_database_url, initialize_database, read_setup_status, setup_locked, test_database_connection

router = APIRouter(prefix="/setup", tags=["setup"])


def ensure_not_installed() -> None:
    if setup_locked() or read_setup_status().installed:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Setup already completed")


def require_loopback(request: Request) -> None:
    """安装向导只能从本机访问,防止远程攻击者在首次部署时接管系统。"""
    client = request.client
    host = client.host if client else ""
    try:
        if not ipaddress.ip_address(host).is_loopback:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Setup must be run from the local machine")
    except ValueError:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Setup must be run from the local machine") from None


@router.get("/status", response_model=SetupStatusOut, dependencies=[Depends(require_loopback)])
def setup_status() -> SetupStatusOut:
    return read_setup_status()


@router.post("/test-database", response_model=DatabaseTestOut, dependencies=[Depends(require_loopback)])
def setup_test_database(payload: DatabaseConfigIn) -> DatabaseTestOut:
    ensure_not_installed()
    return test_database_connection(build_database_url(payload))


@router.post("/initialize", response_model=SetupStatusOut, dependencies=[Depends(require_loopback)])
def setup_initialize(payload: SetupInitializeIn) -> SetupStatusOut:
    ensure_not_installed()
    return initialize_database(payload)
