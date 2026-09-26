from app.schemas.capture import CourseSnapshotIn, TranscriptSegmentIn, VideoEventIn


def test_course_snapshot_payload_accepts_chapter_tree() -> None:
    payload = CourseSnapshotIn(
        adapter_id="wencai-school",
        site_url="https://learning.wencaischool.net/openlearning/console/",
        external_course_id="course-1",
        course_title="习近平新时代中国特色社会主义思想概论",
        term="第3学期",
        chapters=[
            {
                "external_chapter_id": "1",
                "title": "第1章",
                "sort_order": 1,
                "children": [
                    {
                        "external_chapter_id": "1.1",
                        "title": "1.1这门课程的主要内容",
                        "sort_order": 1,
                        "children": [],
                    }
                ],
            }
        ],
    )

    assert payload.chapters[0].children[0].title == "1.1这门课程的主要内容"


def test_video_event_payload_is_limited_to_assistant_events() -> None:
    event = VideoEventIn(
        session_id="session-1",
        event_type="ended",
        video_time_seconds=120.5,
        payload={"message": "remind_user_to_save_progress"},
    )

    assert event.event_type == "ended"


def test_transcript_segment_requires_text() -> None:
    segment = TranscriptSegmentIn(
        external_course_id="course-1",
        external_chapter_id="1.1",
        text="这是一段字幕",
        source="dom-visible-text",
        start_seconds=10,
        end_seconds=15,
    )

    assert segment.text == "这是一段字幕"


def test_video_event_is_persisted_and_listed(client, auth_headers) -> None:
    token = client.post("/api/v1/plugin-tokens", json={"name": "Edge local"}, headers=auth_headers).json()["token"]

    response = client.post(
        "/api/v1/capture/video-event",
        headers={"authorization": f"Bearer {token}"},
        json={
            "session_id": "wencai:course-1:chapter-1",
            "event_type": "video-source",
            "video_time_seconds": 12.5,
            "payload": {
                "course_url": "https://learning.wencaischool.net/openlearning/console/",
                "external_course_id": "course-1",
                "external_chapter_id": "chapter-1",
                "video_source": {
                    "currentSrc": "blob:https://learning.wencaischool.net/session-1",
                    "sourceUrls": ["https://cdn.example.com/lesson.m3u8?token=secret"],
                    "posterUrl": "/cover.png",
                    "isBlob": True,
                    "isLikelySigned": True,
                    "mediaType": "hls",
                },
            },
        },
    )

    assert response.status_code == 200
    assert response.json()["status"] == "accepted"

    list_response = client.get("/api/v1/video-events", headers=auth_headers)
    assert list_response.status_code == 200
    item = list_response.json()["items"][0]
    assert item["session_id"] == "wencai:course-1:chapter-1"
    assert item["event_type"] == "video-source"
    assert item["video_time_seconds"] == 12.5
    assert item["video_source"]["mediaType"] == "hls"
    assert item["video_source"]["isBlob"] is True


def test_video_events_can_be_filtered_by_event_type(client, auth_headers) -> None:
    token = client.post("/api/v1/plugin-tokens", json={"name": "Edge local"}, headers=auth_headers).json()["token"]
    for event_type in ["video-source", "subtitle-diagnostic"]:
        response = client.post(
            "/api/v1/capture/video-event",
            headers={"authorization": f"Bearer {token}"},
            json={
                "session_id": "session-1",
                "event_type": event_type,
                "payload": {"status": "imported" if event_type == "subtitle-diagnostic" else "ok"},
            },
        )
        assert response.status_code == 200

    list_response = client.get("/api/v1/video-events?event_type=subtitle-diagnostic", headers=auth_headers)
    assert list_response.status_code == 200
    items = list_response.json()["items"]
    assert len(items) == 1
    assert items[0]["event_type"] == "subtitle-diagnostic"


def test_video_event_rejects_invalid_plugin_token(client) -> None:
    response = client.post(
        "/api/v1/capture/video-event",
        headers={"authorization": "Bearer bad-token"},
        json={"session_id": "session-1", "event_type": "video-source", "payload": {}},
    )

    assert response.status_code == 401


def test_play_event_creates_video_session_for_progress(client, auth_headers) -> None:
    token = client.post("/api/v1/plugin-tokens", json={"name": "Edge local"}, headers=auth_headers).json()["token"]
    plugin_headers = {"authorization": f"Bearer {token}"}

    snapshot = client.post(
        "/api/v1/capture/course-snapshot",
        headers=plugin_headers,
        json={
            "adapter_id": "wencai-school",
            "site_url": "https://learning.example.com/",
            "external_course_id": "course-progress",
            "course_title": "测试课程",
            "chapters": [
                {
                    "external_chapter_id": "chapter-progress",
                    "title": "第1章",
                    "sort_order": 1,
                    "children": [],
                }
            ],
        },
    )
    assert snapshot.status_code == 200

    play = client.post(
        "/api/v1/capture/video-event",
        headers=plugin_headers,
        json={
            "session_id": "wencai:course-progress:chapter-progress",
            "event_type": "play",
            "video_time_seconds": 150.0,
            "payload": {
                "course_url": "https://learning.example.com/",
                "external_course_id": "course-progress",
                "external_chapter_id": "chapter-progress",
                "video_source": {"currentSrc": "https://cdn.example.com/lesson.mp4"},
            },
        },
    )
    assert play.status_code == 200

    progress = client.get("/api/v1/stats/learning-progress", headers=auth_headers)
    assert progress.status_code == 200
    body = progress.json()
    assert body["continue_learning"] is not None
    assert body["continue_learning"]["chapter_id"] is not None
    assert body["week_minutes"] >= 2  # 150 秒 → 2 分钟


def test_progress_events_also_track_study_minutes(client, auth_headers) -> None:
    """播放中周期性上报的 progress 事件同样要计入学习时长。

    扩展只在 play 那一刻采样的话,从头看到尾的视频只会在 currentTime≈0 上报一次,
    学习时长会被记成 0 —— 所以 progress 必须和 play 一样更新 VideoSession。
    """
    token = client.post("/api/v1/plugin-tokens", json={"name": "Edge progress"}, headers=auth_headers).json()["token"]
    plugin_headers = {"authorization": f"Bearer {token}"}

    snapshot = client.post(
        "/api/v1/capture/course-snapshot",
        headers=plugin_headers,
        json={
            "adapter_id": "wencai-school",
            "site_url": "https://learning.example.com/",
            "external_course_id": "course-tick",
            "course_title": "进度上报课程",
            "chapters": [
                {"external_chapter_id": "chapter-tick", "title": "第1章", "sort_order": 1, "children": []}
            ],
        },
    )
    assert snapshot.status_code == 200

    # 只发 progress,不发 play
    for seconds in (30.0, 240.0):
        response = client.post(
            "/api/v1/capture/video-event",
            headers=plugin_headers,
            json={
                "session_id": "wencai:course-tick:chapter-tick",
                "event_type": "progress",
                "video_time_seconds": seconds,
                "payload": {
                    "course_url": "https://learning.example.com/",
                    "external_course_id": "course-tick",
                    "external_chapter_id": "chapter-tick",
                    "video_source": {"currentSrc": "https://cdn.example.com/lesson.mp4"},
                },
            },
        )
        assert response.status_code == 200

    progress = client.get("/api/v1/stats/learning-progress", headers=auth_headers)
    assert progress.status_code == 200
    body = progress.json()
    assert body["continue_learning"] is not None
    assert body["continue_learning"]["chapter_id"] is not None
    assert body["week_minutes"] >= 4  # 最远位置 240 秒 → 4 分钟
