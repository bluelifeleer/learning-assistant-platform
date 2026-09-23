from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.deps import require_bearer_token
from app.db.session import get_db
from app.schemas.auth import AuthTokenOut, LoginIn, PasswordChangeIn, RegisterIn, UserOut, UserUpdateIn
from app.services.auth import AuthService, user_out

router = APIRouter(prefix="/auth", tags=["auth"])


def get_auth_service(db: Session = Depends(get_db)) -> AuthService:
    return AuthService(db)


@router.post("/register", response_model=AuthTokenOut)
def register(payload: RegisterIn, service: AuthService = Depends(get_auth_service)) -> AuthTokenOut:
    if not get_settings().allow_registration:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Registration is disabled")
    return service.register(payload)


@router.post("/login", response_model=AuthTokenOut)
def login(payload: LoginIn, service: AuthService = Depends(get_auth_service)) -> AuthTokenOut:
    return service.login(payload)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(token: str = Depends(require_bearer_token), service: AuthService = Depends(get_auth_service)) -> Response:
    service.logout(token)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/me", response_model=UserOut)
def me(token: str = Depends(require_bearer_token), service: AuthService = Depends(get_auth_service)) -> UserOut:
    return user_out(service.current_user(token))


@router.put("/me", response_model=UserOut)
def update_me(payload: UserUpdateIn, token: str = Depends(require_bearer_token), service: AuthService = Depends(get_auth_service)) -> UserOut:
    return service.update_current_user(token, payload)


@router.post("/change-password", response_model=UserOut)
def change_password(payload: PasswordChangeIn, token: str = Depends(require_bearer_token), service: AuthService = Depends(get_auth_service)) -> UserOut:
    return service.change_password(token, payload)
