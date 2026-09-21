def create_plugin_token(client, headers) -> str:
    response = client.post("/api/v1/plugin-tokens", json={"name": "Edge local"}, headers=headers)
    assert response.status_code == 200
    return response.json()["token"]


def capture_sample_course(client, token: str) -> None:
    response = client.post(
        "/api/v1/capture/course-snapshot",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "adapter_id": "wencai-school",
            "site_url": "https://learning.wencaischool.net/openlearning/console/",
            "external_course_id": "course-1",
            "course_title": "供应链管理",
            "chapters": [
                {
                    "external_chapter_id": "1",
                    "title": "第1章 课程导论",
                    "sort_order": 1,
                    "children": [
                        {"external_chapter_id": "1.1", "title": "1.1 课程主要内容", "sort_order": 1, "children": []},
                    ],
                }
            ],
        },
    )
    assert response.status_code == 200


def test_note_capture_persists_note_with_source_quote(client, auth_headers):
    token = create_plugin_token(client, auth_headers)
    capture_sample_course(client, token)

    response = client.post(
        "/api/v1/capture/note",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "external_course_id": "course-1",
            "external_chapter_id": "1.1",
            "video_time_seconds": 42.5,
            "content": "这里要复习",
            "source_text": "供应链是价值链",
        },
    )

    assert response.status_code == 200
    assert response.json()["status"] == "accepted"
    notes = client.get("/api/v1/notes", headers=auth_headers).json()["items"]
    assert len(notes) == 1
    assert notes[0]["content"] == "> 供应链是价值链\n\n这里要复习"
    assert notes[0]["chapter_title"] == "1.1 课程主要内容"
    assert notes[0]["video_time_seconds"] == 42.5


def test_note_capture_without_chapter_stores_null_chapter(client, auth_headers):
    token = create_plugin_token(client, auth_headers)
    capture_sample_course(client, token)

    response = client.post(
        "/api/v1/capture/note",
        headers={"Authorization": f"Bearer {token}"},
        json={"external_course_id": "course-1", "content": "无章节笔记"},
    )

    assert response.status_code == 200
    note = client.get("/api/v1/notes", headers=auth_headers).json()["items"][0]
    assert note["chapter_id"] is None
    assert note["content"] == "无章节笔记"


def test_note_capture_returns_404_when_course_missing(client, auth_headers):
    token = create_plugin_token(client, auth_headers)

    response = client.post(
        "/api/v1/capture/note",
        headers={"Authorization": f"Bearer {token}"},
        json={"external_course_id": "ghost-course", "content": "笔记"},
    )

    assert response.status_code == 404
    assert response.json()["detail"] == "course not found, snapshot first"


def test_note_capture_rejects_invalid_plugin_token(client):
    response = client.post(
        "/api/v1/capture/note",
        headers={"Authorization": "Bearer bad-token"},
        json={"external_course_id": "course-1", "content": "笔记"},
    )

    assert response.status_code == 401


def test_note_capture_stores_tags(client, auth_headers):
    token = create_plugin_token(client, auth_headers)
    capture_sample_course(client, token)

    client.post(
        "/api/v1/capture/note",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "external_course_id": "course-1",
            "external_chapter_id": "1.1",
            "content": "学史明理",
            "tags": ["考点", "单选"],
        },
    )

    notes = client.get("/api/v1/notes", headers=auth_headers).json()["items"]
    assert notes[0]["tags"] == ["考点", "单选"]
