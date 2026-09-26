from io import BytesIO
from zipfile import ZipFile


def test_plugin_token_generation_returns_plain_token_once(client, auth_headers):
    response = client.post("/api/v1/plugin-tokens", json={"name": "Edge local"}, headers=auth_headers)

    assert response.status_code == 200
    body = response.json()
    assert body["token"].startswith("lap_")
    assert body["client"]["name"] == "Edge local"
    assert "token_hash" not in body

    status_response = client.get("/api/v1/plugin-status", headers=auth_headers)
    assert status_response.status_code == 200
    status_body = status_response.json()
    assert status_body["clients"][0]["name"] == "Edge local"
    assert "token" not in status_body["clients"][0]


def test_plugin_heartbeat_updates_client_status(client, auth_headers):
    token = client.post("/api/v1/plugin-tokens", json={"name": "Edge local"}, headers=auth_headers).json()["token"]

    response = client.post(
        "/api/v1/plugin-heartbeat",
        headers={"authorization": f"Bearer {token}"},
        json={
            "extension_version": "0.1.0",
            "current_url": "https://learning.wencaischool.net/openlearning/console/",
            "adapter_id": "wencai-school",
            "adapter_name": "Wencai School",
            "enabled_adapters": ["wencai-school", "generic-video"],
        },
    )

    assert response.status_code == 200
    assert response.json()["status"] == "online"

    status_body = client.get("/api/v1/plugin-status", headers=auth_headers).json()
    client_status = status_body["clients"][0]
    assert client_status["online"] is True
    assert client_status["current_url"] == "https://learning.wencaischool.net/openlearning/console/"
    assert client_status["adapter_id"] == "wencai-school"
    assert client_status["enabled_adapters"] == ["wencai-school", "generic-video"]


def test_plugin_heartbeat_rejects_invalid_token(client):
    response = client.post(
        "/api/v1/plugin-heartbeat",
        headers={"authorization": "Bearer bad-token"},
        json={"extension_version": "0.1.0"},
    )

    assert response.status_code == 401


def test_plugin_token_revocation_invalidates_heartbeat(client, auth_headers):
    created = client.post("/api/v1/plugin-tokens", json={"name": "Edge local"}, headers=auth_headers).json()
    token = created["token"]
    token_id = created["token_id"]

    heartbeat = client.post(
        "/api/v1/plugin-heartbeat",
        headers={"authorization": f"Bearer {token}"},
        json={"extension_version": "0.1.0"},
    )
    assert heartbeat.status_code == 200

    revoked = client.delete(f"/api/v1/plugin-tokens/{token_id}", headers=auth_headers)
    assert revoked.status_code == 204

    after = client.post(
        "/api/v1/plugin-heartbeat",
        headers={"authorization": f"Bearer {token}"},
        json={"extension_version": "0.1.0"},
    )
    assert after.status_code == 401


def test_plugin_package_exports_loadable_extension_zip(client, auth_headers):
    response = client.get("/api/v1/plugin-package", headers=auth_headers)

    assert response.status_code == 200
    assert response.headers["content-type"] == "application/zip"

    with ZipFile(BytesIO(response.content)) as archive:
        names = set(archive.namelist())

    assert "manifest.json" in names
    assert "options.html" in names
    assert "dist/content.js" in names
    assert "assets/icon-128.png" in names
    assert "assets/icon-48.png" in names


def test_plugin_package_missing_build_returns_404(client, auth_headers, tmp_path, monkeypatch):
    from app.routes import plugins

    monkeypatch.setattr(plugins, "extension_root", lambda: tmp_path)

    response = client.get("/api/v1/plugin-package", headers=auth_headers)

    assert response.status_code == 404
    assert tmp_path.as_posix() not in response.text
