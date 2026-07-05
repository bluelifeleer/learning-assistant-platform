from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.entities import Chapter, Course, TranscriptSegment
from app.schemas.workspace import TranscriptItem, TranscriptListOut

router = APIRouter(prefix="/transcripts", tags=["transcripts"])


@router.get("", response_model=TranscriptListOut)
def list_transcripts(course_id: str | None = None, db: Session = Depends(get_db)) -> TranscriptListOut:
    query = db.query(TranscriptSegment, Course, Chapter).join(Course, TranscriptSegment.course_id == Course.id).join(Chapter, TranscriptSegment.chapter_id == Chapter.id)
    if course_id:
        query = query.filter(TranscriptSegment.course_id == course_id)
    rows = query.order_by(TranscriptSegment.created_at.desc()).limit(200).all()
    return TranscriptListOut(
        items=[
            TranscriptItem(
                id=segment.id,
                course_id=course.id,
                course_title=course.title,
                chapter_id=chapter.id,
                chapter_title=chapter.title,
                start_seconds=float(segment.start_seconds) if segment.start_seconds is not None else None,
                end_seconds=float(segment.end_seconds) if segment.end_seconds is not None else None,
                text=segment.text,
                source=segment.source,
                created_at=segment.created_at,
            )
            for segment, course, chapter in rows
        ]
    )
