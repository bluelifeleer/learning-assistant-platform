from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.deps import require_bearer_token
from app.db.session import get_db
from app.schemas.auth import AuthTokenOut, LoginIn, RegisterIn, UserOut, UserUpdateIn
from app.services.auth import AuthService, user_out
from app.services.auth_tokens import create_plain_token

router = APIRouter(prefix="/auth", tags=["auth"])


def get_auth_service(db: Session = Depends(get_db)) -> AuthService:
    return AuthService(db)


@router.post("/tokens")
def preview_token() -> dict[str, str]:
    return {"token": create_plain_token()}


@router.post("/register", response_model=AuthTokenOut)
def register(payload: RegisterIn, service: AuthService = Depends(get_auth_service)) -> AuthTokenOut:
    return service.register(payload)


@router.post("/login", response_model=AuthTokenOut)
def login(payload: LoginIn, service: AuthService = Depends(get_auth_service)) -> AuthTokenOut:
    return service.login(payload)


@router.get("/me", response_model=UserOut)
def me(token: str = Depends(require_bearer_token), service: AuthService = Depends(get_auth_service)) -> UserOut:
    return user_out(service.current_user(token))


@router.put("/me", response_model=UserOut)
def update_me(payload: UserUpdateIn, token: str = Depends(require_bearer_token), service: AuthService = Depends(get_auth_service)) -> UserOut:
    return service.update_current_user(token, payload)
