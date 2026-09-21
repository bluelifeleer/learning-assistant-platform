from sqlalchemy.orm import Session

from app.models.entities import Course, VideoCaptureEvent
from app.schemas.workspace import VideoSourceOut

VIDEO_SOURCE_EVENT_TYPES = ("video-source", "play")


def latest_video_events_by_chapter(db: Session, course: Course) -> dict[str | None, VideoCaptureEvent]:
    events = (
        db.query(VideoCaptureEvent)
        .filter(
            VideoCaptureEvent.organization_id == course.organization_id,
            VideoCaptureEvent.external_course_id == course.external_course_id,
            VideoCaptureEvent.event_type.in_(VIDEO_SOURCE_EVENT_TYPES),
        )
        .order_by(VideoCaptureEvent.created_at.desc())
        .all()
    )
    latest: dict[str | None, VideoCaptureEvent] = {}
    for event in events:
        if not event.video_source:
            continue
        if event.external_chapter_id in latest:
            continue
        latest[event.external_chapter_id] = event
    return latest


def video_source_out(raw: dict) -> VideoSourceOut:
    return VideoSourceOut(
        current_src=raw.get("currentSrc"),
        source_urls=[url for url in raw.get("sourceUrls") or [] if isinstance(url, str)],
        poster_url=raw.get("posterUrl"),
        is_blob=bool(raw.get("isBlob")),
        is_likely_signed=bool(raw.get("isLikelySigned")),
        media_type=raw.get("mediaType") or "unknown",
    )


def video_export_info(event: VideoCaptureEvent) -> dict:
    raw = event.video_source or {}
    return {
        "page_url": event.course_url,
        "media_url": raw.get("currentSrc") or (raw.get("sourceUrls") or [None])[0],
        "media_type": raw.get("mediaType") or "unknown",
        "is_likely_signed": bool(raw.get("isLikelySigned")) or bool(raw.get("isBlob")),
    }
