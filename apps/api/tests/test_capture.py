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


def test_video_event_is_persisted_and_listed(client) -> None:
    token = client.post("/api/v1/plugin-tokens", json={"name": "Edge local"}).json()["token"]

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

    list_response = client.get("/api/v1/video-events")
    assert list_response.status_code == 200
    item = list_response.json()["items"][0]
    assert item["session_id"] == "wencai:course-1:chapter-1"
    assert item["event_type"] == "video-source"
    assert item["video_time_seconds"] == 12.5
    assert item["video_source"]["mediaType"] == "hls"
    assert item["video_source"]["isBlob"] is True


def test_video_event_rejects_invalid_plugin_token(client) -> None:
    response = client.post(
        "/api/v1/capture/video-event",
        headers={"authorization": "Bearer bad-token"},
        json={"session_id": "session-1", "event_type": "video-source", "payload": {}},
    )

    assert response.status_code == 401
