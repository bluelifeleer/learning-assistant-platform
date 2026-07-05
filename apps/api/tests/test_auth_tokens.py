from app.services.auth_tokens import create_plain_token, hash_token, verify_token


def test_token_hash_verification() -> None:
    token = create_plain_token()
    digest = hash_token(token, pepper="pepper")

    assert token.startswith("la_")
    assert verify_token(token, digest, pepper="pepper") is True
    assert verify_token(token + "x", digest, pepper="pepper") is False
