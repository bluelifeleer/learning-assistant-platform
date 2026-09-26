from fastapi import Depends, Header, HTTPException, status
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.entities import Membership, User
from app.services.auth import AuthService


def require_bearer_token(authorization: str | None = Header(default=None)) -> str:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing bearer token")
    return authorization.removeprefix("Bearer ").strip()


def require_current_user(token: str = Depends(require_bearer_token), db: Session = Depends(get_db)) -> User:
    return AuthService(db).current_user(token)


def require_owner(user: User = Depends(require_current_user), db: Session = Depends(get_db)) -> User:
    """仅允许组织 owner 访问的管理接口(工作区/AI/邮箱设置、插件 Token 等)。"""
    membership = db.query(Membership).filter(Membership.user_id == user.id, Membership.role == "owner").first()
    if not membership:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Requires owner role")
    return user
