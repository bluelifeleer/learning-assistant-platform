from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.deps import require_current_user
from app.db.session import get_db
from app.models.entities import Chapter, ChapterMemo, ChapterSummary, Course, Note, QuizQuestion, Screenshot, Site, TranscriptSegment, User, VideoSession
from app.schemas.workspace import (
    ChapterDetailOut,
    ChapterFlagsOut,
    ChapterMemoIn,
    ChapterMemoOut,
    CourseCreateIn,
    ChapterNoteOut,
    ChapterOut,
    ChapterTranscriptOut,
    ChapterVideoSourceOut,
    CourseDetailOut,
    CourseFullDetailOut,
    CourseListItem,
    CourseListOut,
    CourseVideoSourcesOut,
)
from app.services.plugins import ensure_default_organization
from app.services.video_sources import latest_video_events_by_chapter, video_source_out

router = APIRouter(prefix="/courses", tags=["courses"])


def _counts_by_course(db: Session, model, course_ids: list[str]) -> dict[str, int]:
    """一次性按 course_id 聚合计数,避免每门课各发一条 COUNT 的 N+1。"""
    if not course_ids:
        return {}
    rows = (
        db.query(model.course_id, func.count(model.id))
        .filter(model.course_id.in_(course_ids))
        .group_by(model.course_id)
        .all()
    )
    return {course_id: count for course_id, count in rows}


@router.get("", response_model=CourseListOut)
def list_courses(_: User = Depends(require_current_user), db: Session = Depends(get_db)) -> CourseListOut:
    courses = db.query(Course).order_by(Course.updated_at.desc()).all()
    course_ids = [course.id for course in courses]
    site_ids = {course.site_id for course in courses if course.site_id}
    sites = {row.id: row for row in db.query(Site).filter(Site.id.in_(site_ids)).all()} if site_ids else {}
    chapter_counts = _counts_by_course(db, Chapter, course_ids)
    transcript_counts = _counts_by_course(db, TranscriptSegment, course_ids)
    note_counts = _counts_by_course(db, Note, course_ids)
    items: list[CourseListItem] = []
    for course in courses:
        site = sites.get(course.site_id)
        items.append(
            CourseListItem(
                id=course.id,
                title=course.title,
                term=course.term,
                site_name=site.name if site else "Unknown",
                adapter_id=site.adapter_id if site else "unknown",
                chapter_count=chapter_counts.get(course.id, 0),
                transcript_count=transcript_counts.get(course.id, 0),
                note_count=note_counts.get(course.id, 0),
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


def _chapter_flag_chapter_ids(db: Session, model, chapter_ids: list[str], extra_filter=None) -> set[str]:
    if not chapter_ids:
        return set()
    query = db.query(model.chapter_id).filter(model.chapter_id.in_(chapter_ids))
    if extra_filter is not None:
        query = query.filter(extra_filter)
    return {row[0] for row in query.distinct().all()}


def _chapter_flags(db: Session, chapter_ids: list[str], user_id: str) -> dict[str, ChapterFlagsOut]:
    """批量计算每个章节的状态徽标,避免 N+1"""
    with_transcript = _chapter_flag_chapter_ids(db, TranscriptSegment, chapter_ids)
    with_notes = _chapter_flag_chapter_ids(db, Note, chapter_ids, Note.user_id == user_id)
    with_summary = _chapter_flag_chapter_ids(db, ChapterSummary, chapter_ids, ChapterSummary.status == "done")
    with_quiz = _chapter_flag_chapter_ids(db, QuizQuestion, chapter_ids)
    # 学过 = 当前用户在该章有播放会话/笔记/截图任一
    studied = (
        _chapter_flag_chapter_ids(db, VideoSession, chapter_ids, VideoSession.user_id == user_id)
        | with_notes
        | _chapter_flag_chapter_ids(db, Screenshot, chapter_ids, Screenshot.user_id == user_id)
    )
    return {
        chapter_id: ChapterFlagsOut(
            has_transcript=chapter_id in with_transcript,
            has_notes=chapter_id in with_notes,
            has_summary=chapter_id in with_summary,
            has_quiz=chapter_id in with_quiz,
            studied=chapter_id in studied,
        )
        for chapter_id in chapter_ids
    }


@router.get("/{course_id}/detail", response_model=CourseFullDetailOut)
def get_course_detail(course_id: str, user: User = Depends(require_current_user), db: Session = Depends(get_db)) -> CourseFullDetailOut:
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
    flags_by_chapter = _chapter_flags(db, chapter_ids, user.id)

    # 预先按 parent_id 分组,避免 build_node 对每个节点都全量扫描 chapters(O(n²))
    children_by_parent: dict[str | None, list[Chapter]] = {}
    for chapter in chapters:
        children_by_parent.setdefault(chapter.parent_id, []).append(chapter)

    def build_node(chapter: Chapter) -> ChapterDetailOut:
        return ChapterDetailOut(
            id=chapter.id,
            parent_id=chapter.parent_id,
            external_chapter_id=chapter.external_chapter_id,
            title=chapter.title,
            sort_order=chapter.sort_order,
            duration_seconds=chapter.duration_seconds,
            flags=flags_by_chapter.get(chapter.id, ChapterFlagsOut()),
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
                    corrected_content=note.corrected_content,
                    tags=list(note.tags or []),
                    created_at=note.created_at,
                )
                for note in notes_by_chapter.get(chapter.id, [])
            ],
            children=[build_node(child) for child in children_by_parent.get(chapter.id, [])],
        )

    roots = [chapter for chapter in chapters if not chapter.parent_id or chapter.parent_id not in chapter_ids]
    return CourseFullDetailOut(
        id=course.id,
        title=course.title,
        term=course.term,
        external_course_id=course.external_course_id,
        chapters=[build_node(chapter) for chapter in roots],
    )


@router.get("/{course_id}/video-sources", response_model=CourseVideoSourcesOut)
def get_course_video_sources(course_id: str, _: User = Depends(require_current_user), db: Session = Depends(get_db)) -> CourseVideoSourcesOut:
    course = db.query(Course).filter(Course.id == course_id).first()
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")
    chapters = db.query(Chapter).filter(Chapter.course_id == course.id).order_by(Chapter.sort_order.asc(), Chapter.title.asc()).all()
    latest = latest_video_events_by_chapter(db, course)

    items: list[ChapterVideoSourceOut] = []
    for chapter in chapters:
        event = latest.get(chapter.external_chapter_id)
        if not event:
            continue
        items.append(
            ChapterVideoSourceOut(
                chapter_id=chapter.id,
                chapter_title=chapter.title,
                course_url=event.course_url,
                video_source=video_source_out(event.video_source),
                captured_at=event.created_at,
            )
        )
    unassigned = latest.get(None)
    # 早期采集的事件章节 id 可能是平台原始 item id(wencai-item:...)而非树节点 id,
    # 匹配不上章节时降级为课程级链接,保证已有数据可见
    unmatched = [event for key, event in latest.items() if key is not None and key not in {chapter.external_chapter_id for chapter in chapters}]
    for event in ([unassigned] if unassigned else []) + unmatched:
        items.append(
            ChapterVideoSourceOut(
                chapter_id=None,
                chapter_title=None,
                course_url=event.course_url,
                video_source=video_source_out(event.video_source),
                captured_at=event.created_at,
            )
        )
    return CourseVideoSourcesOut(items=items)


@router.post("", response_model=CourseListItem)
def create_manual_course(payload: CourseCreateIn, user: User = Depends(require_current_user), db: Session = Depends(get_db)) -> CourseListItem:
    # 控制台手动建课:挂在内置 manual 站点下,external id 用 uuid 保证唯一
    organization = ensure_default_organization(db)
    site = db.query(Site).filter(Site.adapter_id == "manual").first()
    if not site:
        site = Site(adapter_id="manual", name="手动创建", host_patterns={}, status="enabled")
        db.add(site)
        db.flush()
    course = Course(
        organization_id=organization.id,
        site_id=site.id,
        external_course_id=f"manual:{uuid4().hex[:12]}",
        title=payload.title.strip(),
        term=payload.term,
    )
    db.add(course)
    db.commit()
    return CourseListItem(
        id=course.id,
        title=course.title,
        term=course.term,
        site_name=site.name,
        adapter_id=site.adapter_id,
        chapter_count=0,
        transcript_count=0,
        note_count=0,
        updated_at=course.updated_at,
    )


@router.get("/chapters/{chapter_id}/memo", response_model=ChapterMemoOut)
def read_chapter_memo(chapter_id: str, _: User = Depends(require_current_user), db: Session = Depends(get_db)) -> ChapterMemoOut:
    memo = db.query(ChapterMemo).filter(ChapterMemo.chapter_id == chapter_id).first()
    if not memo:
        return ChapterMemoOut(chapter_id=chapter_id, content_md="", updated_at=None)
    return ChapterMemoOut(chapter_id=memo.chapter_id, content_md=memo.content_md, updated_at=memo.updated_at)


@router.put("/chapters/{chapter_id}/memo", response_model=ChapterMemoOut)
def save_chapter_memo(chapter_id: str, payload: ChapterMemoIn, _: User = Depends(require_current_user), db: Session = Depends(get_db)) -> ChapterMemoOut:
    chapter = db.query(Chapter).filter(Chapter.id == chapter_id).first()
    if not chapter:
        raise HTTPException(status_code=404, detail="Chapter not found")
    memo = db.query(ChapterMemo).filter(ChapterMemo.chapter_id == chapter_id).first()
    if not memo:
        memo = ChapterMemo(chapter_id=chapter_id, course_id=chapter.course_id, content_md=payload.content_md)
        db.add(memo)
    else:
        memo.content_md = payload.content_md
    db.commit()
    db.refresh(memo)
    return ChapterMemoOut(chapter_id=memo.chapter_id, content_md=memo.content_md, updated_at=memo.updated_at)
