from datetime import UTC, datetime, timedelta
from hashlib import pbkdf2_hmac
import hmac
from secrets import token_urlsafe

from fastapi import HTTPException, status
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.models.entities import ApiToken, Membership, User
from app.schemas.auth import AuthTokenOut, LoginIn, PasswordChangeIn, RegisterIn, UserOut, UserUpdateIn
from app.services.auth_tokens import create_plain_token, hash_token
from app.services.plugins import ensure_default_organization

PASSWORD_ITERATIONS = 120_000
SESSION_TOKEN_TTL = timedelta(days=30)


def hash_password(password: str, salt: str | None = None) -> str:
    actual_salt = salt or token_urlsafe(16)
    digest = pbkdf2_hmac("sha256", password.encode("utf-8"), actual_salt.encode("utf-8"), PASSWORD_ITERATIONS).hex()
    return f"pbkdf2_sha256${PASSWORD_ITERATIONS}${actual_salt}${digest}"


def verify_password(password: str, stored_hash: str) -> bool:
    try:
        algorithm, iterations, salt, expected = stored_hash.split("$", 3)
    except ValueError:
        return False
    if algorithm != "pbkdf2_sha256":
        return False
    try:
        iterations_int = int(iterations)
    except ValueError:
        return False
    digest = pbkdf2_hmac("sha256", password.encode("utf-8"), salt.encode("utf-8"), iterations_int).hex()
    return hmac.compare_digest(digest, expected)


def user_out(user: User) -> UserOut:
    return UserOut(id=user.id, username=user.username, email=user.email, display_name=user.display_name)


class AuthService:
    def __init__(self, db: Session):
        self.db = db

    def create_session_token(self, user: User) -> str:
        organization = ensure_default_organization(self.db)
        token = create_plain_token()
        now = datetime.now(UTC)
        self.db.add(
            ApiToken(
                organization_id=organization.id,
                user_id=user.id,
                token_hash=hash_token(token, get_settings().api_token_pepper),
                name="Console session",
                last_used_at=now,
                expires_at=now + SESSION_TOKEN_TTL,
            )
        )
        return token

    def register(self, payload: RegisterIn) -> AuthTokenOut:
        email = payload.email.lower()
        if self.db.query(User).filter(User.email == email).first():
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already registered")
        organization = ensure_default_organization(self.db)
        user = User(email=email, display_name=payload.display_name, password_hash=hash_password(payload.password))
        self.db.add(user)
        self.db.flush()
        # 开放注册时,新用户默认是普通成员,不具备修改工作区/AI/邮箱设置等管理权限;
        # 管理员只能通过安装向导创建,或由现有 owner 手动提升。
        self.db.add(Membership(organization_id=organization.id, user_id=user.id, role="member"))
        token = self.create_session_token(user)
        self.db.commit()
        self.db.refresh(user)
        return AuthTokenOut(token=token, user=user_out(user))

    def update_current_user(self, bearer_token: str, payload: UserUpdateIn) -> UserOut:
        user = self.current_user(bearer_token)
        if payload.display_name is not None:
            user.display_name = payload.display_name
        if payload.username is not None:
            username = payload.username.strip().lower()
            if username:
                existing = self.db.query(User).filter(User.username == username, User.id != user.id).first()
                if existing:
                    raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Username already registered")
            user.username = username or None
        self.db.commit()
        self.db.refresh(user)
        return user_out(user)

    def change_password(self, bearer_token: str, payload: PasswordChangeIn) -> UserOut:
        user = self.current_user(bearer_token)
        if not verify_password(payload.current_password, user.password_hash):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="当前密码不正确")
        user.password_hash = hash_password(payload.new_password)
        self.db.commit()
        self.db.refresh(user)
        return user_out(user)

    def login(self, payload: LoginIn) -> AuthTokenOut:
        account = (payload.account or "").strip()
        user = self.db.query(User).filter(User.email == account.lower()).first()
        if not user:
            user = self.db.query(User).filter(User.username == account.lower()).first()
        if not user or not verify_password(payload.password, user.password_hash):
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password")
        token = self.create_session_token(user)
        self.db.commit()
        self.db.refresh(user)
        return AuthTokenOut(token=token, user=user_out(user))

    def current_user(self, bearer_token: str) -> User:
        digest = hash_token(bearer_token, get_settings().api_token_pepper)
        now = datetime.now(UTC)
        token = (
            self.db.query(ApiToken)
            .filter(
                ApiToken.token_hash == digest,
                ApiToken.user_id.is_not(None),
                ApiToken.revoked_at.is_(None),
                or_(ApiToken.expires_at.is_(None), ApiToken.expires_at > now),
            )
            .first()
        )
        if not token:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid session token")
        user = self.db.query(User).filter(User.id == token.user_id).first()
        if not user:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")
        # last_used_at 只需分钟级精度,避免每个 GET 请求都触发一次写库
        last = token.last_used_at
        if last is not None and last.tzinfo is None:
            last = last.replace(tzinfo=UTC)
        if last is None or (now - last) > timedelta(minutes=1):
            token.last_used_at = now
            self.db.commit()
        return user

    def logout(self, bearer_token: str) -> None:
        digest = hash_token(bearer_token, get_settings().api_token_pepper)
        token = self.db.query(ApiToken).filter(ApiToken.token_hash == digest, ApiToken.user_id.is_not(None), ApiToken.revoked_at.is_(None)).first()
        if not token:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid session token")
        token.revoked_at = datetime.now(UTC)
        self.db.commit()
