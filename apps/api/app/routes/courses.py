from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.entities import Chapter, Course, Note, Site, TranscriptSegment
from app.schemas.workspace import ChapterOut, CourseDetailOut, CourseListItem, CourseListOut

router = APIRouter(prefix="/courses", tags=["courses"])


@router.get("", response_model=CourseListOut)
def list_courses(db: Session = Depends(get_db)) -> CourseListOut:
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
def get_course(course_id: str, db: Session = Depends(get_db)) -> CourseDetailOut:
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
