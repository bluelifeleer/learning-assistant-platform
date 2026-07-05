from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.deps import require_bearer_token
from app.db.session import get_db
from app.models.entities import Chapter, Course, Note
from app.schemas.workspace import NoteCreateIn, NoteItem, NoteListOut
from app.services.auth import AuthService

router = APIRouter(prefix="/notes", tags=["notes"])


def note_item(db: Session, note: Note) -> NoteItem:
    course = db.query(Course).filter(Course.id == note.course_id).first()
    chapter = db.query(Chapter).filter(Chapter.id == note.chapter_id).first() if note.chapter_id else None
    return NoteItem(
        id=note.id,
        course_id=note.course_id,
        course_title=course.title if course else "Unknown",
        chapter_id=note.chapter_id,
        chapter_title=chapter.title if chapter else None,
        video_time_seconds=float(note.video_time_seconds) if note.video_time_seconds is not None else None,
        content=note.content,
        created_at=note.created_at,
    )


@router.get("", response_model=NoteListOut)
def list_notes(db: Session = Depends(get_db)) -> NoteListOut:
    notes = db.query(Note).order_by(Note.created_at.desc()).limit(200).all()
    return NoteListOut(items=[note_item(db, note) for note in notes])


@router.post("", response_model=NoteItem)
def create_note(payload: NoteCreateIn, token: str = Depends(require_bearer_token), db: Session = Depends(get_db)) -> NoteItem:
    user = AuthService(db).current_user(token)
    note = Note(
        course_id=payload.course_id,
        chapter_id=payload.chapter_id,
        user_id=user.id,
        video_time_seconds=payload.video_time_seconds,
        content=payload.content,
    )
    db.add(note)
    db.commit()
    db.refresh(note)
    return note_item(db, note)
