from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.deps import require_current_user
from app.db.session import get_db
from app.models.entities import Chapter, Course, Note, Site, TranscriptSegment, User
from app.schemas.workspace import (
    ChapterDetailOut,
    ChapterNoteOut,
    ChapterOut,
    ChapterTranscriptOut,
    CourseDetailOut,
    CourseFullDetailOut,
    CourseListItem,
    CourseListOut,
)

router = APIRouter(prefix="/courses", tags=["courses"])


@router.get("", response_model=CourseListOut)
def list_courses(_: User = Depends(require_current_user), db: Session = Depends(get_db)) -> CourseListOut:
    courses = db.query(Course).order_by(Course.updated_at.desc()).all()
    items: list[CourseListItem] = []
    for course in courses:
        site = db.query(Site).filter(Site.id == course.site_id).first()
        items.append(
            CourseListItem(
                id=course.id,
                title=course.title,
                term=course.term,
                site_name=site.name if site else "Unknown",
                adapter_id=site.adapter_id if site else "unknown",
                chapter_count=db.query(func.count(Chapter.id)).filter(Chapter.course_id == course.id).scalar() or 0,
                transcript_count=db.query(func.count(TranscriptSegment.id)).filter(TranscriptSegment.course_id == course.id).scalar() or 0,
                note_count=db.query(func.count(Note.id)).filter(Note.course_id == course.id).scalar() or 0,
                updated_at=course.updated_at,
            )
        )
    return CourseListOut(items=items)


@router.get("/{course_id}", response_model=CourseDetailOut)
def get_course(course_id: str, _: User = Depends(require_current_user), db: Session = Depends(get_db)) -> CourseDetailOut:
    course = db.query(Course).filter(Course.id == course_id).first()
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")
    chapters = db.query(Chapter).filter(Chapter.course_id == course.id).order_by(Chapter.sort_order.asc(), Chapter.title.asc()).all()
    return CourseDetailOut(
        id=course.id,
        title=course.title,
        term=course.term,
        chapters=[ChapterOut(id=chapter.id, parent_id=chapter.parent_id, title=chapter.title, sort_order=chapter.sort_order) for chapter in chapters],
    )


def _to_float(value) -> float | None:
    return float(value) if value is not None else None


@router.get("/{course_id}/detail", response_model=CourseFullDetailOut)
def get_course_detail(course_id: str, _: User = Depends(require_current_user), db: Session = Depends(get_db)) -> CourseFullDetailOut:
    course = db.query(Course).filter(Course.id == course_id).first()
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")
    chapters = db.query(Chapter).filter(Chapter.course_id == course.id).order_by(Chapter.sort_order.asc(), Chapter.title.asc()).all()
    chapter_ids = [chapter.id for chapter in chapters]
    transcripts = (
        db.query(TranscriptSegment)
        .filter(TranscriptSegment.chapter_id.in_(chapter_ids))
        .order_by(TranscriptSegment.start_seconds.asc())
        .all()
        if chapter_ids
        else []
    )
    notes = db.query(Note).filter(Note.chapter_id.in_(chapter_ids)).order_by(Note.created_at.asc()).all() if chapter_ids else []
    transcripts_by_chapter: dict[str, list[TranscriptSegment]] = {}
    for segment in transcripts:
        transcripts_by_chapter.setdefault(segment.chapter_id, []).append(segment)
    notes_by_chapter: dict[str, list[Note]] = {}
    for note in notes:
        if note.chapter_id:
            notes_by_chapter.setdefault(note.chapter_id, []).append(note)

    def build_node(chapter: Chapter) -> ChapterDetailOut:
        return ChapterDetailOut(
            id=chapter.id,
            parent_id=chapter.parent_id,
            external_chapter_id=chapter.external_chapter_id,
            title=chapter.title,
            sort_order=chapter.sort_order,
            duration_seconds=chapter.duration_seconds,
            transcripts=[
                ChapterTranscriptOut(
                    id=segment.id,
                    start_seconds=_to_float(segment.start_seconds),
                    end_seconds=_to_float(segment.end_seconds),
                    text=segment.text,
                    source=segment.source,
                )
                for segment in transcripts_by_chapter.get(chapter.id, [])
            ],
            notes=[
                ChapterNoteOut(
                    id=note.id,
                    user_id=note.user_id,
                    video_time_seconds=_to_float(note.video_time_seconds),
                    content=note.content,
                    created_at=note.created_at,
                )
                for note in notes_by_chapter.get(chapter.id, [])
            ],
            children=[build_node(child) for child in chapters if child.parent_id == chapter.id],
        )

    roots = [chapter for chapter in chapters if not chapter.parent_id or chapter.parent_id not in chapter_ids]
    return CourseFullDetailOut(
        id=course.id,
        title=course.title,
        term=course.term,
        external_course_id=course.external_course_id,
        chapters=[build_node(chapter) for chapter in roots],
    )
