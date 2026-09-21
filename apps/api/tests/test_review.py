def create_plugin_token(client, headers) -> str:
    response = client.post("/api/v1/plugin-tokens", json={"name": "Edge local"}, headers=headers)
    assert response.status_code == 200
    return response.json()["token"]


def seed_note_with_transcript(client, auth_headers) -> str:
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
            "text": "附近字幕一",
            "source": "dom-visible-text",
            "start_seconds": 55,
            "end_seconds": 60,
        },
    )
    client.post(
        "/api/v1/capture/transcript-segment",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "external_course_id": "course-1",
            "external_chapter_id": "1.1",
            "text": "远处字幕",
            "source": "dom-visible-text",
            "start_seconds": 200,
            "end_seconds": 205,
        },
    )
    note = client.post(
        "/api/v1/capture/note",
        headers={"Authorization": f"Bearer {token}"},
        json={"external_course_id": "course-1", "external_chapter_id": "1.1", "video_time_seconds": 60, "content": "关键概念"},
    )
    return note.json()["note_id"]


def create_card(client, headers, note_id: str) -> dict:
    response = client.post("/api/v1/review/cards", headers=headers, json={"note_id": note_id})
    assert response.status_code == 200
    return response.json()


def test_card_created_from_note_uses_nearby_transcript_as_back(client, auth_headers):
    note_id = seed_note_with_transcript(client, auth_headers)

    card = create_card(client, auth_headers, note_id)

    assert card["front"] == "关键概念"
    assert "附近字幕一" in card["back"]
    assert "远处字幕" not in card["back"]
    assert card["ease_factor"] == 2.5
    assert card["interval_days"] == 0
    assert card["review_count"] == 0
    assert card["note_id"] == note_id


def test_card_back_is_empty_without_transcript(client, auth_headers):
    token = create_plugin_token(client, auth_headers)
    client.post(
        "/api/v1/capture/course-snapshot",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "adapter_id": "wencai-school",
            "site_url": "https://learning.wencaischool.net/openlearning/console/",
            "external_course_id": "course-1",
            "course_title": "供应链管理",
            "chapters": [],
        },
    )
    note = client.post(
        "/api/v1/capture/note",
        headers={"Authorization": f"Bearer {token}"},
        json={"external_course_id": "course-1", "content": "无字幕笔记"},
    )

    card = create_card(client, auth_headers, note.json()["note_id"])

    assert card["back"] == ""


def test_first_good_answer_schedules_one_day(client, auth_headers):
    card = create_card(client, auth_headers, seed_note_with_transcript(client, auth_headers))

    response = client.post(f"/api/v1/review/cards/{card['id']}/answer", headers=auth_headers, json={"result": "good"})

    assert response.status_code == 200
    updated = response.json()
    assert updated["interval_days"] == 1
    assert updated["ease_factor"] == 2.5
    assert updated["review_count"] == 1
    due_ids = [item["id"] for item in client.get("/api/v1/review/due", headers=auth_headers).json()["items"]]
    assert card["id"] not in due_ids


def test_again_answer_drops_ease_and_is_due_immediately(client, auth_headers):
    card = create_card(client, auth_headers, seed_note_with_transcript(client, auth_headers))

    response = client.post(f"/api/v1/review/cards/{card['id']}/answer", headers=auth_headers, json={"result": "again"})

    assert response.status_code == 200
    updated = response.json()
    assert updated["interval_days"] == 0
    assert updated["ease_factor"] == 2.3
    assert updated["review_count"] == 1
    due_ids = [item["id"] for item in client.get("/api/v1/review/due", headers=auth_headers).json()["items"]]
    assert card["id"] in due_ids


def test_consecutive_good_answers_grow_interval(client, auth_headers):
    card = create_card(client, auth_headers, seed_note_with_transcript(client, auth_headers))
    intervals = []
    for _ in range(3):
        response = client.post(f"/api/v1/review/cards/{card['id']}/answer", headers=auth_headers, json={"result": "good"})
        assert response.status_code == 200
        intervals.append(response.json()["interval_days"])

    assert intervals == [1, 2, 5]
    cards = client.get("/api/v1/review/cards", headers=auth_headers).json()["items"]
    assert cards[0]["review_count"] == 3


def test_answer_rejects_invalid_result(client, auth_headers):
    card = create_card(client, auth_headers, seed_note_with_transcript(client, auth_headers))

    response = client.post(f"/api/v1/review/cards/{card['id']}/answer", headers=auth_headers, json={"result": "easy"})

    assert response.status_code == 422


def test_answer_missing_card_returns_404(client, auth_headers):
    response = client.post("/api/v1/review/cards/not-a-card/answer", headers=auth_headers, json={"result": "good"})

    assert response.status_code == 404


def test_review_routes_require_auth(client):
    assert client.get("/api/v1/review/cards").status_code == 401
    assert client.get("/api/v1/review/due").status_code == 401
    assert client.post("/api/v1/review/cards", json={"note_id": "x"}).status_code == 401
