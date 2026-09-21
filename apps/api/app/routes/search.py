from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.deps import require_current_user
from app.db.session import get_db
from app.models.entities import Chapter, Course, Note, TranscriptSegment, User
from app.schemas.workspace import NoteItem, SearchOut, TranscriptItem

router = APIRouter(prefix="/search", tags=["search"])

RESULT_LIMIT = 50


def escape_like(query: str) -> str:
    return query.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


@router.get("", response_model=SearchOut)
def search(
    q: str = Query(min_length=1),
    _: User = Depends(require_current_user),
    db: Session = Depends(get_db),
) -> SearchOut:
    pattern = f"%{escape_like(q)}%"
    notes = (
        db.query(Note)
        .filter(Note.content.ilike(pattern, escape="\\"))
        .order_by(Note.created_at.desc())
        .limit(RESULT_LIMIT)
        .all()
    )
    segments = (
        db.query(TranscriptSegment)
        .filter(TranscriptSegment.text.ilike(pattern, escape="\\"))
        .order_by(TranscriptSegment.created_at.desc())
        .limit(RESULT_LIMIT)
        .all()
    )
    course_ids = {note.course_id for note in notes} | {segment.course_id for segment in segments}
    chapter_ids = {note.chapter_id for note in notes if note.chapter_id} | {segment.chapter_id for segment in segments}
    courses = {course.id: course for course in db.query(Course).filter(Course.id.in_(course_ids)).all()} if course_ids else {}
    chapters = {chapter.id: chapter for chapter in db.query(Chapter).filter(Chapter.id.in_(chapter_ids)).all()} if chapter_ids else {}

    def course_title(course_id: str) -> str:
        course = courses.get(course_id)
        return course.title if course else "Unknown"

    def chapter_title(chapter_id: str | None) -> str | None:
        chapter = chapters.get(chapter_id) if chapter_id else None
        return chapter.title if chapter else None

    return SearchOut(
        notes=[
            NoteItem(
                id=note.id,
                course_id=note.course_id,
                course_title=course_title(note.course_id),
                chapter_id=note.chapter_id,
                chapter_title=chapter_title(note.chapter_id),
                video_time_seconds=float(note.video_time_seconds) if note.video_time_seconds is not None else None,
                content=note.content,
                created_at=note.created_at,
            )
            for note in notes
        ],
        transcripts=[
            TranscriptItem(
                id=segment.id,
                course_id=segment.course_id,
                course_title=course_title(segment.course_id),
                chapter_id=segment.chapter_id,
                chapter_title=chapter_title(segment.chapter_id) or "Unknown",
                start_seconds=float(segment.start_seconds) if segment.start_seconds is not None else None,
                end_seconds=float(segment.end_seconds) if segment.end_seconds is not None else None,
                text=segment.text,
                source=segment.source,
                created_at=segment.created_at,
            )
            for segment in segments
        ],
    )
