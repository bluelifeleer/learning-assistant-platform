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
