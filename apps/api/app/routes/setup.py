from fastapi import APIRouter, HTTPException, status

from app.schemas.setup import DatabaseConfigIn, DatabaseTestOut, SetupInitializeIn, SetupStatusOut
from app.services.setup import build_database_url, initialize_database, read_setup_status, test_database_connection

router = APIRouter(prefix="/setup", tags=["setup"])


def ensure_not_installed() -> None:
    if read_setup_status().installed:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Setup already completed")


@router.get("/status", response_model=SetupStatusOut)
def setup_status() -> SetupStatusOut:
    return read_setup_status()


@router.post("/test-database", response_model=DatabaseTestOut)
def setup_test_database(payload: DatabaseConfigIn) -> DatabaseTestOut:
    ensure_not_installed()
    return test_database_connection(build_database_url(payload))


@router.post("/initialize", response_model=SetupStatusOut)
def setup_initialize(payload: SetupInitializeIn) -> SetupStatusOut:
    ensure_not_installed()
    return initialize_database(payload)
