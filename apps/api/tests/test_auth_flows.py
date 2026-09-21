from app.core.config import get_settings


def register_user(client, email: str = "user@example.com") -> str:
    response = client.post(
        "/api/v1/auth/register",
        json={"email": email, "password": "secret123", "display_name": "User One"},
    )
    assert response.status_code == 200
    return response.json()["token"]


def test_register_login_and_me(client):
    register_response = client.post(
        "/api/v1/auth/register",
        json={"email": "user@example.com", "password": "secret123", "display_name": "User One"},
    )

    assert register_response.status_code == 200
    token = register_response.json()["token"]
    assert register_response.json()["user"]["username"] is None

    login_response = client.post(
        "/api/v1/auth/login",
        json={"account": "user@example.com", "password": "secret123"},
    )

    assert login_response.status_code == 200
    assert login_response.json()["user"]["email"] == "user@example.com"

    me_response = client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"})

    assert me_response.status_code == 200
    assert me_response.json()["email"] == "user@example.com"
    assert me_response.json()["username"] is None


def test_register_rejected_when_registration_disabled(client, monkeypatch):
    monkeypatch.setenv("ALLOW_REGISTRATION", "false")
    get_settings.cache_clear()
    try:
        response = client.post(
            "/api/v1/auth/register",
            json={"email": "blocked@example.com", "password": "secret123", "display_name": "Blocked"},
        )
    finally:
        get_settings.cache_clear()

    assert response.status_code == 403


def test_logout_revokes_session_token(client):
    token = register_user(client)
    headers = {"Authorization": f"Bearer {token}"}
    assert client.get("/api/v1/auth/me", headers=headers).status_code == 200

    logout_response = client.post("/api/v1/auth/logout", headers=headers)

    assert logout_response.status_code == 204
    assert client.get("/api/v1/auth/me", headers=headers).status_code == 401


def test_logout_rejects_unknown_token(client):
    response = client.post("/api/v1/auth/logout", headers={"Authorization": "Bearer not-a-token"})

    assert response.status_code == 401


def test_auth_tokens_endpoint_is_removed(client):
    response = client.post("/api/v1/auth/tokens")

    assert response.status_code in (404, 405)


def test_login_rejects_wrong_password(client):
    client.post(
        "/api/v1/auth/register",
        json={"email": "user@example.com", "password": "secret123", "display_name": "User One"},
    )

    response = client.post("/api/v1/auth/login", json={"account": "user@example.com", "password": "bad-password"})

    assert response.status_code == 401


def test_can_set_username_after_login_and_use_it_as_account(client):
    register_response = client.post(
        "/api/v1/auth/register",
        json={"email": "lipeng@example.com", "password": "secret123", "display_name": "李鹏"},
    )
    token = register_response.json()["token"]
    update_response = client.put(
        "/api/v1/auth/me",
        headers={"Authorization": f"Bearer {token}"},
        json={"username": "lipeng", "display_name": "李鹏"},
    )

    assert update_response.status_code == 200
    assert update_response.json()["username"] == "lipeng"

    response = client.post("/api/v1/auth/login", json={"account": "lipeng", "password": "secret123"})

    assert response.status_code == 200
    assert response.json()["user"]["email"] == "lipeng@example.com"


def test_login_accepts_legacy_email_field_as_account(client):
    client.post(
        "/api/v1/auth/register",
        json={"email": "legacy@example.com", "password": "secret123", "display_name": "Legacy User"},
    )
    token = client.post("/api/v1/auth/login", json={"account": "legacy@example.com", "password": "secret123"}).json()["token"]
    client.put(
        "/api/v1/auth/me",
        headers={"Authorization": f"Bearer {token}"},
        json={"username": "legacy"},
    )

    response = client.post("/api/v1/auth/login", json={"email": "legacy", "password": "secret123"})

    assert response.status_code == 200
    assert response.json()["user"]["username"] == "legacy"


def test_update_profile_rejects_duplicate_username(client):
    first = client.post(
        "/api/v1/auth/register",
        json={"email": "one@example.com", "password": "secret123", "display_name": "User One"},
    )
    second = client.post(
        "/api/v1/auth/register",
        json={"email": "two@example.com", "password": "secret123", "display_name": "User Two"},
    )
    client.put(
        "/api/v1/auth/me",
        headers={"Authorization": f"Bearer {first.json()['token']}"},
        json={"username": "same"},
    )

    response = client.put(
        "/api/v1/auth/me",
        headers={"Authorization": f"Bearer {second.json()['token']}"},
        json={"username": "same"},
    )

    assert response.status_code == 409
