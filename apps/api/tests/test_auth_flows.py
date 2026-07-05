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
