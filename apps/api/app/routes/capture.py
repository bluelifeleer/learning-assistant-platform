from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.deps import require_bearer_token
from app.db.session import get_db
from app.schemas.capture import CourseSnapshotIn, TranscriptSegmentIn, VideoEventIn
from app.services.capture import CaptureService

router = APIRouter(prefix="/capture", tags=["capture"])


def get_capture_service(db: Session = Depends(get_db)) -> CaptureService:
    return CaptureService(db)


@router.post("/course-snapshot")
def course_snapshot(
    payload: CourseSnapshotIn,
    token: str = Depends(require_bearer_token),
    service: CaptureService = Depends(get_capture_service),
) -> dict[str, str]:
    return service.accept_course_snapshot(token, payload)


@router.post("/video-event")
def video_event(
    payload: VideoEventIn,
    token: str = Depends(require_bearer_token),
    service: CaptureService = Depends(get_capture_service),
) -> dict[str, str]:
    return service.accept_video_event(token, payload)


@router.post("/transcript-segment")
def transcript_segment(
    payload: TranscriptSegmentIn,
    token: str = Depends(require_bearer_token),
    service: CaptureService = Depends(get_capture_service),
) -> dict[str, str]:
    return service.accept_transcript_segment(token, payload)
