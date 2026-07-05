def create_plugin_token(client) -> str:
    response = client.post("/api/v1/plugin-tokens", json={"name": "Edge local"})
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
            "term": "第3学期",
            "chapters": [
                {
                    "external_chapter_id": "1",
                    "title": "第1章 课程导论",
                    "sort_order": 1,
                    "children": [
                        {
                            "external_chapter_id": "1.1",
                            "title": "1.1 课程主要内容",
                            "sort_order": 1,
                            "children": [],
                        }
                    ],
                }
            ],
        },
    )
    assert response.status_code == 200


def test_capture_persists_course_and_transcript_for_workspace_pages(client):
    token = create_plugin_token(client)
    capture_sample_course(client, token)

    transcript_response = client.post(
        "/api/v1/capture/transcript-segment",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "external_course_id": "course-1",
            "external_chapter_id": "1.1",
            "text": "欢迎学习供应链管理",
            "source": "dom-visible-text",
            "start_seconds": 0,
            "end_seconds": 8,
        },
    )
    assert transcript_response.status_code == 200

    courses = client.get("/api/v1/courses").json()["items"]
    assert courses[0]["title"] == "供应链管理"
    assert courses[0]["chapter_count"] == 2

    transcripts = client.get("/api/v1/transcripts").json()["items"]
    assert transcripts[0]["text"] == "欢迎学习供应链管理"
    assert transcripts[0]["course_title"] == "供应链管理"

    adapters = client.get("/api/v1/adapters").json()["items"]
    assert adapters[0]["adapter_id"] == "wencai-school"


def test_notes_and_exports_have_workspace_lists(client):
    user = client.post(
        "/api/v1/auth/register",
        json={"email": "user@example.com", "password": "secret123", "display_name": "User One"},
    ).json()
    plugin_token = create_plugin_token(client)
    capture_sample_course(client, plugin_token)
    course_id = client.get("/api/v1/courses").json()["items"][0]["id"]

    note_response = client.post(
        "/api/v1/notes",
        headers={"Authorization": f"Bearer {user['token']}"},
        json={"course_id": course_id, "content": "这里需要复习", "video_time_seconds": 12},
    )
    assert note_response.status_code == 200
    assert client.get("/api/v1/notes").json()["items"][0]["content"] == "这里需要复习"

    export_response = client.post(
        "/api/v1/exports",
        headers={"Authorization": f"Bearer {user['token']}"},
        json={"course_id": course_id, "format": "markdown"},
    )
    assert export_response.status_code == 200
    assert client.get("/api/v1/exports").json()["items"][0]["format"] == "markdown"
