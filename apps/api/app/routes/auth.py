from fastapi import APIRouter

from app.services.auth_tokens import create_plain_token

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/tokens")
def preview_token() -> dict[str, str]:
    return {"token": create_plain_token()}
