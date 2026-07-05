
def test_plugin_cors_preflight_allows_learning_site_origin(client):
    response = client.options(
        "/api/v1/plugin-heartbeat",
        headers={
            "origin": "https://learning.wencaischool.net",
            "access-control-request-method": "POST",
            "access-control-request-headers": "authorization,content-type",
        },
    )

    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "*"
    assert "authorization" in response.headers["access-control-allow-headers"].lower()
