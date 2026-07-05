from datetime import UTC, datetime
from hashlib import pbkdf2_hmac
from secrets import token_urlsafe

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.models.entities import ApiToken, Membership, User
from app.schemas.auth import AuthTokenOut, LoginIn, RegisterIn, UserOut
from app.services.auth_tokens import create_plain_token, hash_token
from app.services.plugins import ensure_default_organization

PASSWORD_ITERATIONS = 120_000


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
    digest = pbkdf2_hmac("sha256", password.encode("utf-8"), salt.encode("utf-8"), int(iterations)).hex()
    return digest == expected


def user_out(user: User) -> UserOut:
    return UserOut(id=user.id, email=user.email, display_name=user.display_name)


class AuthService:
    def __init__(self, db: Session):
        self.db = db

    def create_session_token(self, user: User) -> str:
        organization = ensure_default_organization(self.db)
        token = create_plain_token()
        self.db.add(
            ApiToken(
                organization_id=organization.id,
                user_id=user.id,
                token_hash=hash_token(token, get_settings().api_token_pepper),
                name="Console session",
                last_used_at=datetime.now(UTC),
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
        self.db.add(Membership(organization_id=organization.id, user_id=user.id, role="owner"))
        token = self.create_session_token(user)
        self.db.commit()
        self.db.refresh(user)
        return AuthTokenOut(token=token, user=user_out(user))

    def login(self, payload: LoginIn) -> AuthTokenOut:
        user = self.db.query(User).filter(User.email == payload.email.lower()).first()
        if not user or not verify_password(payload.password, user.password_hash):
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password")
        token = self.create_session_token(user)
        self.db.commit()
        self.db.refresh(user)
        return AuthTokenOut(token=token, user=user_out(user))

    def current_user(self, bearer_token: str) -> User:
        digest = hash_token(bearer_token, get_settings().api_token_pepper)
        token = self.db.query(ApiToken).filter(ApiToken.token_hash == digest, ApiToken.user_id.is_not(None), ApiToken.revoked_at.is_(None)).first()
        if not token:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid session token")
        token.last_used_at = datetime.now(UTC)
        user = self.db.query(User).filter(User.id == token.user_id).first()
        if not user:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")
        self.db.commit()
        return user
