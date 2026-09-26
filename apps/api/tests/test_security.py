from uuid import uuid4


def test_login_rate_limited_after_repeated_failures(client):
    account = f"ratelimit-{uuid4().hex}@example.com"
    for _ in range(10):
        response = client.post("/api/v1/auth/login", json={"account": account, "password": "wrong-password"})
        assert response.status_code == 401

    blocked = client.post("/api/v1/auth/login", json={"account": account, "password": "wrong-password"})
    assert blocked.status_code == 429


def test_member_cannot_access_owner_endpoints(client):
    registration = client.post(
        "/api/v1/auth/register",
        json={"email": f"member-{uuid4().hex[:8]}@example.com", "password": "secret123", "display_name": "Member"},
    )
    assert registration.status_code == 200
    headers = {"Authorization": f"Bearer {registration.json()['token']}"}

    assert client.get("/api/v1/settings", headers=headers).status_code == 403
    assert client.put("/api/v1/ai/settings", headers=headers, json={}).status_code == 403
    assert client.put("/api/v1/email/settings", headers=headers, json={}).status_code == 403
    assert client.post("/api/v1/plugin-tokens", json={"name": "x"}, headers=headers).status_code == 403

    # 普通成员仍可访问业务接口
    assert client.get("/api/v1/courses", headers=headers).status_code == 200


def test_business_endpoints_require_authentication(client):
    checks = [
        ("GET", "/api/v1/courses"),
        ("GET", "/api/v1/transcripts"),
        ("GET", "/api/v1/video-events"),
        ("GET", "/api/v1/notes"),
        ("POST", "/api/v1/notes"),
        ("GET", "/api/v1/adapters"),
        ("POST", "/api/v1/adapters"),
        ("PUT", "/api/v1/adapters/generic-video"),
        ("GET", "/api/v1/exports"),
        ("POST", "/api/v1/exports"),
        ("GET", "/api/v1/exports/some-id/download"),
        ("GET", "/api/v1/settings"),
        ("PUT", "/api/v1/settings"),
        ("POST", "/api/v1/plugin-tokens"),
        ("GET", "/api/v1/plugin-status"),
        ("GET", "/api/v1/plugin-package"),
    ]
    for method, url in checks:
        response = client.request(method, url)
        assert response.status_code == 401, f"{method} {url} expected 401, got {response.status_code}"


def test_business_endpoints_reject_invalid_token(client):
    headers = {"Authorization": "Bearer invalid-token"}

    assert client.get("/api/v1/courses", headers=headers).status_code == 401
    assert client.get("/api/v1/settings", headers=headers).status_code == 401
    assert client.post("/api/v1/plugin-tokens", json={"name": "x"}, headers=headers).status_code == 401


def test_capture_endpoints_still_reject_missing_plugin_token(client):
    assert client.post("/api/v1/capture/course-snapshot", json={}).status_code == 401
    assert client.post("/api/v1/capture/video-event", json={}).status_code == 401
    assert client.post("/api/v1/capture/transcript-segment", json={}).status_code == 401
    assert client.post("/api/v1/plugin-heartbeat", json={}).status_code == 401


def test_setup_status_stays_public(client):
    response = client.get("/api/v1/setup/status")

    assert response.status_code == 200
