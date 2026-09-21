def create_plugin_token(client, headers) -> str:
    response = client.post("/api/v1/plugin-tokens", json={"name": "Edge local"}, headers=headers)
    assert response.status_code == 200
    return response.json()["token"]


def seed_workspace(client, auth_headers) -> None:
    token = create_plugin_token(client, auth_headers)
    client.post(
        "/api/v1/capture/course-snapshot",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "adapter_id": "wencai-school",
            "site_url": "https://learning.wencaischool.net/openlearning/console/",
            "external_course_id": "course-1",
            "course_title": "供应链管理",
            "chapters": [{"external_chapter_id": "1.1", "title": "1.1 课程主要内容", "sort_order": 1, "children": []}],
        },
    )
    client.post(
        "/api/v1/capture/transcript-segment",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "external_course_id": "course-1",
            "external_chapter_id": "1.1",
            "text": "库存管理是供应链的核心",
            "source": "dom-visible-text",
            "start_seconds": 10,
            "end_seconds": 15,
        },
    )
    client.post(
        "/api/v1/capture/note",
        headers={"Authorization": f"Bearer {token}"},
        json={"external_course_id": "course-1", "external_chapter_id": "1.1", "content": "库存周转率要记住"},
    )
    for _ in range(2):
        client.post(
            "/api/v1/capture/video-event",
            headers={"Authorization": f"Bearer {token}"},
            json={"session_id": "session-1", "event_type": "play", "payload": {}},
        )


def test_search_hits_notes_and_transcripts(client, auth_headers):
    seed_workspace(client, auth_headers)

    response = client.get("/api/v1/search?q=库存", headers=auth_headers)

    assert response.status_code == 200
    data = response.json()
    assert len(data["notes"]) == 1
    assert data["notes"][0]["content"] == "库存周转率要记住"
    assert data["notes"][0]["course_title"] == "供应链管理"
    assert data["notes"][0]["chapter_title"] == "1.1 课程主要内容"
    assert len(data["transcripts"]) == 1
    assert data["transcripts"][0]["text"] == "库存管理是供应链的核心"
    assert data["transcripts"][0]["start_seconds"] == 10


def test_search_without_match_returns_empty_lists(client, auth_headers):
    seed_workspace(client, auth_headers)

    response = client.get("/api/v1/search?q=不存在的词语", headers=auth_headers)

    assert response.status_code == 200
    assert response.json() == {"notes": [], "transcripts": []}


def test_search_escapes_like_wildcards(client, auth_headers):
    seed_workspace(client, auth_headers)

    response = client.get("/api/v1/search?q=%25", headers=auth_headers)

    assert response.status_code == 200
    assert response.json() == {"notes": [], "transcripts": []}


def test_stats_summary_counts_and_daily_series(client, auth_headers):
    seed_workspace(client, auth_headers)

    response = client.get("/api/v1/stats/summary", headers=auth_headers)

    assert response.status_code == 200
    data = response.json()
    assert data["courses"] == 1
    assert data["notes"] == 1
    assert data["transcripts"] == 1
    assert data["play_events"] == 2
    assert len(data["daily"]) == 7
    today = data["daily"][-1]
    assert today["notes"] == 1
    assert today["play_events"] == 2
    earlier = data["daily"][:-1]
    assert all(day["notes"] == 0 and day["play_events"] == 0 for day in earlier)


def test_stats_summary_requires_auth(client):
    response = client.get("/api/v1/stats/summary")

    assert response.status_code == 401


def test_search_matches_corrected_content_and_returns_tags(client, auth_headers):
    from tests.test_note_capture import capture_sample_course, create_plugin_token

    token = create_plugin_token(client, auth_headers)
    capture_sample_course(client, token)
    course_id = client.get("/api/v1/courses", headers=auth_headers).json()["items"][0]["id"]
    note = client.post(
        "/api/v1/notes",
        headers=auth_headers,
        json={"course_id": course_id, "content": "学识名利", "tags": ["高频"]},
    ).json()
    client.patch(
        f"/api/v1/notes/{note['id']}/correction",
        headers=auth_headers,
        json={"corrected_content": "学史明理"},
    )

    result = client.get("/api/v1/search", params={"q": "学史明理"}, headers=auth_headers).json()

    assert len(result["notes"]) == 1
    assert result["notes"][0]["corrected_content"] == "学史明理"
    assert result["notes"][0]["tags"] == ["高频"]
    assert result["notes"][0]["chapter_id"] is None or isinstance(result["notes"][0]["chapter_id"], str)
