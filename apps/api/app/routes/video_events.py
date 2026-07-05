from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.entities import VideoCaptureEvent
from app.schemas.workspace import VideoEventItem, VideoEventListOut

router = APIRouter(prefix="/video-events", tags=["video-events"])


@router.get("", response_model=VideoEventListOut)
def list_video_events(session_id: str | None = None, db: Session = Depends(get_db)) -> VideoEventListOut:
    query = db.query(VideoCaptureEvent)
    if session_id:
        query = query.filter(VideoCaptureEvent.session_id == session_id)
    events = query.order_by(VideoCaptureEvent.created_at.desc()).limit(100).all()
    return VideoEventListOut(
        items=[
            VideoEventItem(
                id=event.id,
                session_id=event.session_id,
                event_type=event.event_type,
                video_time_seconds=float(event.video_time_seconds) if event.video_time_seconds is not None else None,
                course_url=event.course_url,
                external_course_id=event.external_course_id,
                external_chapter_id=event.external_chapter_id,
                video_source=event.video_source or {},
                payload=event.payload or {},
                created_at=event.created_at,
            )
            for event in events
        ]
    )
