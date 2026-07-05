from fastapi import APIRouter, Depends

from app.core.deps import require_bearer_token
from app.schemas.capture import CourseSnapshotIn, TranscriptSegmentIn, VideoEventIn
from app.services.capture import CaptureService

router = APIRouter(prefix="/capture", tags=["capture"])


def get_capture_service() -> CaptureService:
    return CaptureService()


@router.post("/course-snapshot")
def course_snapshot(
    payload: CourseSnapshotIn,
    _token: str = Depends(require_bearer_token),
    service: CaptureService = Depends(get_capture_service),
) -> dict[str, str]:
    return service.accept_course_snapshot(payload)


@router.post("/video-event")
def video_event(
    payload: VideoEventIn,
    _token: str = Depends(require_bearer_token),
    service: CaptureService = Depends(get_capture_service),
) -> dict[str, str]:
    return service.accept_video_event(payload)


@router.post("/transcript-segment")
def transcript_segment(
    payload: TranscriptSegmentIn,
    _token: str = Depends(require_bearer_token),
    service: CaptureService = Depends(get_capture_service),
) -> dict[str, str]:
    return service.accept_transcript_segment(payload)
