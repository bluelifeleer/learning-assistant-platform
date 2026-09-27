from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.deps import require_current_user
from app.db.session import get_db
from app.models.entities import Chapter, Course, Note, ReviewCard, User
from app.schemas.workspace import (
    NoteBulkIdsIn,
    NoteBulkResultOut,
    NoteBulkTagsIn,
    NoteCorrectionIn,
    NoteCreateIn,
    NoteItem,
    NoteListOut,
    NoteTagsIn,
    NoteUpdateIn,
)

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


def _detach_review_cards(db: Session, note_ids: list[str]) -> None:
    """删除笔记前先摘掉复习卡片对它的引用(卡片本身保留,只是不再指向已删笔记)。"""
    db.query(ReviewCard).filter(ReviewCard.note_id.in_(note_ids)).update(
        {"note_id": None}, synchronize_session=False
    )


def _merge_tags(current: list[str], incoming: list[str], mode: str) -> list[str]:
    incoming = [tag for tag in incoming if tag]
    if mode == "set":
        return list(dict.fromkeys(incoming))
    if mode == "remove":
        removing = set(incoming)
        return [tag for tag in current if tag not in removing]
    return list(dict.fromkeys([*current, *incoming]))


@router.post("/bulk-tags", response_model=NoteBulkResultOut)
def bulk_tag_notes(payload: NoteBulkTagsIn, _: User = Depends(require_current_user), db: Session = Depends(get_db)) -> NoteBulkResultOut:
    """给选中的笔记批量打标签 / 去标签 / 覆盖标签。"""
    notes = db.query(Note).filter(Note.id.in_(payload.ids)).all()
    for note in notes:
        note.tags = _merge_tags([tag for tag in (note.tags or []) if tag], payload.tags, payload.mode)
    db.commit()
    return NoteBulkResultOut(affected=len(notes))


@router.post("/bulk-delete", response_model=NoteBulkResultOut)
def bulk_delete_notes(payload: NoteBulkIdsIn, _: User = Depends(require_current_user), db: Session = Depends(get_db)) -> NoteBulkResultOut:
    notes = db.query(Note).filter(Note.id.in_(payload.ids)).all()
    ids = [note.id for note in notes]
    if ids:
        _detach_review_cards(db, ids)
        for note in notes:
            db.delete(note)
        db.commit()
    return NoteBulkResultOut(affected=len(ids))


@router.delete("/{note_id}", response_model=NoteBulkResultOut)
def delete_note(note_id: str, _: User = Depends(require_current_user), db: Session = Depends(get_db)) -> NoteBulkResultOut:
    note = db.query(Note).filter(Note.id == note_id).first()
    if not note:
        raise HTTPException(status_code=404, detail="Note not found")
    _detach_review_cards(db, [note.id])
    db.delete(note)
    db.commit()
    return NoteBulkResultOut(affected=1)
