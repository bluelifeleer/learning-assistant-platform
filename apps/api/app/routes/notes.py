from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.deps import require_current_user
from app.db.session import get_db
from app.models.entities import Chapter, Course, Note, User
from app.schemas.workspace import NoteCorrectionIn, NoteCreateIn, NoteItem, NoteListOut, NoteTagsIn, NoteUpdateIn

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
def list_notes(
    course_id: str | None = None,
    tag: str | None = None,
    _: User = Depends(require_current_user),
    db: Session = Depends(get_db),
) -> NoteListOut:
    query = db.query(Note)
    if course_id:
        query = query.filter(Note.course_id == course_id)
    query = query.order_by(Note.created_at.desc())
    # tags 是 JSON 数组,PG/MySQL 写法不同,统一在 Python 侧过滤;
    # 带 tag 过滤时先取全量再过滤再截断,避免匹配项落在 limit(500) 之外导致漏数据。
    if tag:
        notes = [note for note in query.all() if tag in (note.tags or [])][:500]
    else:
        notes = query.limit(500).all()
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


@router.patch("/{note_id}", response_model=NoteItem)
def update_note(note_id: str, payload: NoteUpdateIn, _: User = Depends(require_current_user), db: Session = Depends(get_db)) -> NoteItem:
    """直接编辑笔记内容:覆盖原文。与「勘误」不同,勘误保留原文另存 corrected_content。"""
    note = db.query(Note).filter(Note.id == note_id).first()
    if not note:
        raise HTTPException(status_code=404, detail="Note not found")
    content = payload.content.strip()
    if not content:
        raise HTTPException(status_code=422, detail="笔记内容不能为空")
    note.content = content
    # 直接编辑后旧的勘误不再适用,一并清除
    note.corrected_content = None
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
