TINY_JPEG_BASE64 = "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAABAgMEBQYHCAkKCwwNDg8QERITFBUWFxgZGhscHR4fICEiIyQlJicoKSorLC0uLzAxMjM0NTY3ODk6Ozw9Pj//wAARCAABAAEDASIAAhEBAxEB/8QAFAABAAAAAAAAAAAAAAAAAAAAAAAAAAD/2gAMAwEAAhEDEQA/ANLPIP/Z"
TINY_PNG_BASE64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="


def test_note_image_upload_with_data_url_prefix(client, auth_headers):
    response = client.post(
        "/api/v1/notes/images",
        headers=auth_headers,
        json={"image_base64": f"data:image/png;base64,{TINY_PNG_BASE64}"},
    )

    assert response.status_code == 200
    image_id = response.json()["id"]

    fetched = client.get(f"/api/v1/notes/images/{image_id}/image", headers=auth_headers)
    assert fetched.status_code == 200
    assert fetched.headers["content-type"].startswith("image/png")


def test_note_image_upload_plain_base64(client, auth_headers):
    response = client.post("/api/v1/notes/images", headers=auth_headers, json={"image_base64": TINY_JPEG_BASE64})

    assert response.status_code == 200
    image_id = response.json()["id"]

    fetched = client.get(f"/api/v1/notes/images/{image_id}/image", headers=auth_headers)
    assert fetched.status_code == 200
    assert fetched.headers["content-type"].startswith("image/jpeg")
    assert len(fetched.content) > 0


def test_note_image_upload_rejects_invalid_base64(client, auth_headers):
    response = client.post("/api/v1/notes/images", headers=auth_headers, json={"image_base64": "not-valid-base64!!!"})

    assert response.status_code == 400


def test_note_image_upload_rejects_oversized_image(client, auth_headers):
    response = client.post("/api/v1/notes/images", headers=auth_headers, json={"image_base64": "QUJD" * 2796203})

    assert response.status_code == 413


def test_note_image_returns_404_for_unknown_id(client, auth_headers):
    response = client.get("/api/v1/notes/images/no-such-id/image", headers=auth_headers)

    assert response.status_code == 404


def test_note_images_routes_require_authentication(client):
    assert client.post("/api/v1/notes/images", json={"image_base64": TINY_JPEG_BASE64}).status_code == 401
    assert client.get("/api/v1/notes/images/some-id/image").status_code == 401


def test_capture_note_image_upload_with_plugin_token(client, auth_headers):
    from tests.test_note_capture import create_plugin_token

    token = create_plugin_token(client, auth_headers)

    response = client.post(
        "/api/v1/capture/note-image",
        headers={"Authorization": f"Bearer {token}"},
        json={"image_base64": f"data:image/png;base64,{TINY_PNG_BASE64}"},
    )

    assert response.status_code == 200
    image_id = response.json()["id"]

    fetched = client.get(f"/api/v1/notes/images/{image_id}/image", headers=auth_headers)
    assert fetched.status_code == 200
    assert fetched.headers["content-type"].startswith("image/png")


def test_capture_note_image_rejects_invalid_plugin_token(client):
    response = client.post(
        "/api/v1/capture/note-image",
        headers={"Authorization": "Bearer bad-token"},
        json={"image_base64": TINY_PNG_BASE64},
    )

    assert response.status_code == 401
