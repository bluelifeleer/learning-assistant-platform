def test_register_login_and_me(client):
    register_response = client.post(
        "/api/v1/auth/register",
        json={"email": "user@example.com", "password": "secret123", "display_name": "User One"},
    )

    assert register_response.status_code == 200
    token = register_response.json()["token"]

    login_response = client.post(
        "/api/v1/auth/login",
        json={"email": "user@example.com", "password": "secret123"},
    )

    assert login_response.status_code == 200
    assert login_response.json()["user"]["email"] == "user@example.com"

    me_response = client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"})

    assert me_response.status_code == 200
    assert me_response.json()["email"] == "user@example.com"


def test_login_rejects_wrong_password(client):
    client.post(
        "/api/v1/auth/register",
        json={"email": "user@example.com", "password": "secret123", "display_name": "User One"},
    )

    response = client.post("/api/v1/auth/login", json={"email": "user@example.com", "password": "bad-password"})

    assert response.status_code == 401
