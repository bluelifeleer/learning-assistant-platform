def create_plugin_token(client, headers) -> str:
    response = client.post("/api/v1/plugin-tokens", json={"name": "Edge local"}, headers=headers)
    assert response.status_code == 200
    return response.json()["token"]


def build_course_with_content(client, auth_headers) -> str:
    token = create_plugin_token(client, auth_headers)
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
    transcript = client.post(
        "/api/v1/capture/transcript-segment",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "external_course_id": "course-1",
            "external_chapter_id": "1.1",
            "text": "欢迎学习供应链管理",
            "source": "dom-visible-text",
            "start_seconds": 5,
            "end_seconds": 9,
        },
    )
    assert transcript.status_code == 200
    note = client.post(
        "/api/v1/capture/note",
        headers={"Authorization": f"Bearer {token}"},
        json={"external_course_id": "course-1", "external_chapter_id": "1.1", "video_time_seconds": 6, "content": "重点标记"},
    )
    assert note.status_code == 200
    return client.get("/api/v1/courses", headers=auth_headers).json()["items"][0]["id"]


def test_course_detail_returns_chapter_tree_with_transcripts_and_notes(client, auth_headers):
    course_id = build_course_with_content(client, auth_headers)

    response = client.get(f"/api/v1/courses/{course_id}/detail", headers=auth_headers)

    assert response.status_code == 200
    detail = response.json()
    assert detail["title"] == "供应链管理"
    assert detail["external_course_id"] == "course-1"
    assert len(detail["chapters"]) == 1
    root = detail["chapters"][0]
    assert root["title"] == "第1章 课程导论"
    assert root["parent_id"] is None
    assert len(root["children"]) == 1
    child = root["children"][0]
    assert child["title"] == "1.1 课程主要内容"
    assert child["parent_id"] == root["id"]
    assert child["transcripts"][0]["text"] == "欢迎学习供应链管理"
    assert child["transcripts"][0]["start_seconds"] == 5
    assert child["notes"][0]["content"] == "重点标记"
    assert child["notes"][0]["video_time_seconds"] == 6


def test_course_detail_returns_404_for_unknown_course(client, auth_headers):
    response = client.get("/api/v1/courses/not-a-course/detail", headers=auth_headers)

    assert response.status_code == 404


def test_course_detail_requires_auth(client):
    response = client.get("/api/v1/courses/anything/detail")

    assert response.status_code == 401


def test_course_video_sources_returns_latest_per_chapter(client, auth_headers):
    from tests.test_note_capture import create_plugin_token

    token = create_plugin_token(client, auth_headers)
    from tests.test_note_capture import capture_sample_course

    capture_sample_course(client, token)
    client.post(
        "/api/v1/capture/video-event",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "session_id": "s1",
            "event_type": "video-source",
            "payload": {
                "course_url": "https://learning.wencaischool.net/openlearning/console/course/1",
                "external_course_id": "course-1",
                "external_chapter_id": "1.1",
                "video_source": {
                    "currentSrc": "https://cdn.example.com/1.1.mp4?sign=abc",
                    "sourceUrls": ["https://cdn.example.com/1.1.mp4?sign=abc"],
                    "posterUrl": None,
                    "isBlob": False,
                    "isLikelySigned": True,
                    "mediaType": "file",
                },
            },
        },
    )

    courses = client.get("/api/v1/courses", headers=auth_headers).json()["items"]
    response = client.get(f"/api/v1/courses/{courses[0]['id']}/video-sources", headers=auth_headers)

    assert response.status_code == 200
    items = response.json()["items"]
    assert len(items) == 1
    item = items[0]
    assert item["chapter_title"] == "1.1 课程主要内容"
    assert item["course_url"] == "https://learning.wencaischool.net/openlearning/console/course/1"
    assert item["video_source"]["current_src"] == "https://cdn.example.com/1.1.mp4?sign=abc"
    assert item["video_source"]["is_likely_signed"] is True
    assert item["video_source"]["media_type"] == "file"


def test_course_video_sources_requires_authentication(client):
    assert client.get("/api/v1/courses/some-course/video-sources").status_code == 401


def test_course_video_sources_falls_back_to_course_level_for_unmatched_chapter_ids(client, auth_headers):
    from tests.test_note_capture import capture_sample_course, create_plugin_token

    token = create_plugin_token(client, auth_headers)
    capture_sample_course(client, token)
    client.post(
        "/api/v1/capture/video-event",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "session_id": "s1",
            "event_type": "play",
            "payload": {
                "course_url": "https://learning.wencaischool.net/openlearning/separation/courseware/index.html",
                "external_course_id": "course-1",
                "external_chapter_id": "wencai-item:999",
                "video_source": {
                    "currentSrc": "https://cdn.example.com/legacy.mp4",
                    "sourceUrls": [],
                    "posterUrl": None,
                    "isBlob": False,
                    "isLikelySigned": False,
                    "mediaType": "file",
                },
            },
        },
    )

    course_id = client.get("/api/v1/courses", headers=auth_headers).json()["items"][0]["id"]
    items = client.get(f"/api/v1/courses/{course_id}/video-sources", headers=auth_headers).json()["items"]

    assert len(items) == 1
    assert items[0]["chapter_id"] is None
    assert items[0]["video_source"]["current_src"] == "https://cdn.example.com/legacy.mp4"
