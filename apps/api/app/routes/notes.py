from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.deps import require_current_user
from app.db.session import get_db
from app.models.entities import Chapter, Course, Note, User
from app.schemas.workspace import NoteCorrectionIn, NoteCreateIn, NoteItem, NoteListOut, NoteTagsIn

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
        corrected_content=note.corrected_content,
        tags=list(note.tags or []),
        created_at=note.created_at,
    )


@router.get("", response_model=NoteListOut)
def list_notes(_: User = Depends(require_current_user), db: Session = Depends(get_db)) -> NoteListOut:
    notes = db.query(Note).order_by(Note.created_at.desc()).limit(200).all()
    return NoteListOut(items=[note_item(db, note) for note in notes])


@router.post("", response_model=NoteItem)
def create_note(payload: NoteCreateIn, user: User = Depends(require_current_user), db: Session = Depends(get_db)) -> NoteItem:
    note = Note(
        course_id=payload.course_id,
        chapter_id=payload.chapter_id,
        user_id=user.id,
        video_time_seconds=payload.video_time_seconds,
        content=payload.content,
        tags=[tag for tag in payload.tags if tag],
    )
    db.add(note)
    db.commit()
    db.refresh(note)
    return note_item(db, note)


@router.patch("/{note_id}/correction", response_model=NoteItem)
def save_note_correction(note_id: str, payload: NoteCorrectionIn, _: User = Depends(require_current_user), db: Session = Depends(get_db)) -> NoteItem:
    note = db.query(Note).filter(Note.id == note_id).first()
    if not note:
        raise HTTPException(status_code=404, detail="Note not found")
    corrected = (payload.corrected_content or "").strip()
    note.corrected_content = corrected or None
    db.commit()
    db.refresh(note)
    return note_item(db, note)


@router.patch("/{note_id}/tags", response_model=NoteItem)
def save_note_tags(note_id: str, payload: NoteTagsIn, _: User = Depends(require_current_user), db: Session = Depends(get_db)) -> NoteItem:
    note = db.query(Note).filter(Note.id == note_id).first()
    if not note:
        raise HTTPException(status_code=404, detail="Note not found")
    note.tags = [tag for tag in payload.tags if tag]
    db.commit()
    db.refresh(note)
    return note_item(db, note)
