import hashlib
import hmac
import secrets


def create_plain_token() -> str:
    return "la_" + secrets.token_urlsafe(32)


def hash_token(token: str, pepper: str) -> str:
    return hmac.new(pepper.encode("utf-8"), token.encode("utf-8"), hashlib.sha256).hexdigest()


def verify_token(token: str, digest: str, pepper: str) -> bool:
    expected = hash_token(token, pepper)
    return hmac.compare_digest(expected, digest)
