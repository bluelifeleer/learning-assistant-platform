from tests.test_note_capture import capture_sample_course, create_plugin_token

TINY_JPEG_BASE64 = "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAABAgMEBQYHCAkKCwwNDg8QERITFBUWFxgZGhscHR4fICEiIyQlJicoKSorLC0uLzAxMjM0NTY3ODk6Ozw9Pj//wAARCAABAAEDASIAAhEBAxEB/8QAFAABAAAAAAAAAAAAAAAAAAAAAAAAAAD/2gAMAwEAAhEDEQA/ANLPIP/Z"


def test_screenshot_capture_persists_screenshot(client, auth_headers):
    token = create_plugin_token(client, auth_headers)
    capture_sample_course(client, token)

    response = client.post(
        "/api/v1/capture/screenshot",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "external_course_id": "course-1",
            "external_chapter_id": "1.1",
            "video_time_seconds": 12.5,
            "image_base64": f"data:image/jpeg;base64,{TINY_JPEG_BASE64}",
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    screenshots = client.get("/api/v1/screenshots", headers=auth_headers).json()["items"]
    assert len(screenshots) == 1
    assert screenshots[0]["id"] == body["id"]
    assert screenshots[0]["course_title"] == "供应链管理"
    assert screenshots[0]["chapter_title"] == "1.1 课程主要内容"
    assert screenshots[0]["video_time_seconds"] == 12.5


def test_screenshot_capture_accepts_plain_base64(client, auth_headers):
    token = create_plugin_token(client, auth_headers)
    capture_sample_course(client, token)

    response = client.post(
        "/api/v1/capture/screenshot",
        headers={"Authorization": f"Bearer {token}"},
        json={"external_course_id": "course-1", "image_base64": TINY_JPEG_BASE64},
    )

    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_screenshot_capture_returns_404_when_course_missing(client, auth_headers):
    token = create_plugin_token(client, auth_headers)

    response = client.post(
        "/api/v1/capture/screenshot",
        headers={"Authorization": f"Bearer {token}"},
        json={"external_course_id": "ghost-course", "image_base64": TINY_JPEG_BASE64},
    )

    assert response.status_code == 404
    assert response.json()["detail"] == "course not found, snapshot first"


def test_screenshot_capture_rejects_invalid_plugin_token(client):
    response = client.post(
        "/api/v1/capture/screenshot",
        headers={"Authorization": "Bearer bad-token"},
        json={"external_course_id": "course-1", "image_base64": TINY_JPEG_BASE64},
    )

    assert response.status_code == 401


def test_screenshot_capture_rejects_oversized_image(client, auth_headers):
    token = create_plugin_token(client, auth_headers)
    capture_sample_course(client, token)

    response = client.post(
        "/api/v1/capture/screenshot",
        headers={"Authorization": f"Bearer {token}"},
        json={"external_course_id": "course-1", "image_base64": "QUJD" * 2796203},
    )

    assert response.status_code == 413


def test_screenshot_image_endpoint_serves_file(client, auth_headers):
    token = create_plugin_token(client, auth_headers)
    capture_sample_course(client, token)
    capture = client.post(
        "/api/v1/capture/screenshot",
        headers={"Authorization": f"Bearer {token}"},
        json={"external_course_id": "course-1", "image_base64": TINY_JPEG_BASE64},
    )
    screenshot_id = capture.json()["id"]

    response = client.get(f"/api/v1/screenshots/{screenshot_id}/image", headers=auth_headers)

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("image/jpeg")
    assert len(response.content) > 0


def test_screenshot_image_returns_404_for_unknown_id(client, auth_headers):
    response = client.get("/api/v1/screenshots/no-such-id/image", headers=auth_headers)

    assert response.status_code == 404


def test_screenshot_list_filters_by_course(client, auth_headers):
    token = create_plugin_token(client, auth_headers)
    capture_sample_course(client, token)
    client.post(
        "/api/v1/capture/screenshot",
        headers={"Authorization": f"Bearer {token}"},
        json={"external_course_id": "course-1", "image_base64": TINY_JPEG_BASE64},
    )
    screenshots = client.get("/api/v1/screenshots", headers=auth_headers).json()["items"]
    course_id = screenshots[0]["course_id"]

    filtered = client.get(f"/api/v1/screenshots?course_id={course_id}", headers=auth_headers).json()["items"]
    missing = client.get("/api/v1/screenshots?course_id=ghost", headers=auth_headers).json()["items"]

    assert len(filtered) == 1
    assert missing == []


def test_screenshots_routes_require_authentication(client):
    assert client.get("/api/v1/screenshots").status_code == 401
    assert client.get("/api/v1/screenshots/some-id/image").status_code == 401


def test_screenshot_delete_removes_record_and_file(client, auth_headers):
    token = create_plugin_token(client, auth_headers)
    capture_sample_course(client, token)

    created = client.post(
        "/api/v1/capture/screenshot",
        headers={"Authorization": f"Bearer {token}"},
        json={"external_course_id": "course-1", "image_base64": TINY_JPEG_BASE64},
    ).json()

    deleted = client.delete(f"/api/v1/screenshots/{created['id']}", headers=auth_headers)
    assert deleted.status_code == 204

    assert client.get(f"/api/v1/screenshots/{created['id']}/image", headers=auth_headers).status_code == 404
    assert client.get("/api/v1/screenshots", headers=auth_headers).json()["items"] == []


def test_screenshot_delete_returns_404_for_unknown_id(client, auth_headers):
    assert client.delete("/api/v1/screenshots/no-such-id", headers=auth_headers).status_code == 404


def test_screenshot_image_can_be_replaced(client, auth_headers):
    token = create_plugin_token(client, auth_headers)
    capture_sample_course(client, token)

    created = client.post(
        "/api/v1/capture/screenshot",
        headers={"Authorization": f"Bearer {token}"},
        json={"external_course_id": "course-1", "image_base64": TINY_JPEG_BASE64},
    ).json()

    tiny_png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
    updated = client.put(
        f"/api/v1/screenshots/{created['id']}/image",
        headers=auth_headers,
        json={"image_base64": f"data:image/png;base64,{tiny_png}"},
    )
    assert updated.status_code == 200

    fetched = client.get(f"/api/v1/screenshots/{created['id']}/image", headers=auth_headers)
    assert fetched.status_code == 200
    assert fetched.headers["content-type"].startswith("image/png")


def test_screenshot_image_update_returns_404_for_unknown_id(client, auth_headers):
    response = client.put(
        "/api/v1/screenshots/no-such-id/image",
        headers=auth_headers,
        json={"image_base64": TINY_JPEG_BASE64},
    )
    assert response.status_code == 404
