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
