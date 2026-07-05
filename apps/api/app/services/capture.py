from app.schemas.capture import CourseSnapshotIn, TranscriptSegmentIn, VideoEventIn


class CaptureService:
    def accept_course_snapshot(self, payload: CourseSnapshotIn) -> dict[str, str]:
        return {"status": "accepted", "external_course_id": payload.external_course_id}

    def accept_video_event(self, payload: VideoEventIn) -> dict[str, str]:
        return {"status": "accepted", "session_id": payload.session_id}

    def accept_transcript_segment(self, payload: TranscriptSegmentIn) -> dict[str, str]:
        return {"status": "accepted", "external_course_id": payload.external_course_id}
