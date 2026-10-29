"""把导入计划落到数据库（merge 语义）+ 媒体落盘。

只增不覆盖：已有对象按自然键/指纹匹配上就跳过，空字段才补；
`dry_run=True` 时全程只读，产出「将会发生什么」的统计。

规范见 docs/superpowers/specs/2026-10-28-import-export-package.md 第 6、7、8 节。
"""

from __future__ import annotations

import dataclasses
import hashlib
from dataclasses import dataclass, field
from datetime import UTC, datetime
from pathlib import Path
from types import SimpleNamespace
from typing import Any, Callable
from uuid import uuid4

from sqlalchemy.orm import Session

from app.models.entities import (
    Chapter,
    ChapterMemo,
    ChapterSummary,
    Course,
    CourseSummary,
    Note,
    NoteImage,
    Organization,
    QuizQuestion,
    ReviewCard,
    Screenshot,
    Site,
    TranscriptSegment,
    User,
)
from app.services.capture import note_images_dir_path, screenshots_dir_path
from app.services.import_source import CourseDocument, ImportPlan, MediaEntry, open_archive

MAX_CONFLICTS = 20
#: merge 只增不覆盖；new 强制副本；replace 复用课程但覆盖内容
SUPPORTED_STRATEGIES = ("merge", "new", "replace")


@dataclass
class ImportStats:
    dry_run: bool = False
    strategy: str = "merge"
    courses_created: int = 0
    courses_matched: int = 0
    chapters_created: int = 0
    chapters_matched: int = 0
    transcripts_added: int = 0
    transcripts_skipped: int = 0
    notes_added: int = 0
    notes_skipped: int = 0
    screenshots_added: int = 0
    screenshots_skipped: int = 0
    note_images_added: int = 0
    note_images_skipped: int = 0
    summaries_added: int = 0
    memos_added: int = 0
    cards_added: int = 0
    cards_skipped: int = 0
    quiz_added: int = 0
    quiz_skipped: int = 0
    media_written: int = 0
    media_skipped: int = 0
    media_overwritten: int = 0
    counts_expected: dict[str, int] = field(default_factory=dict)
    conflicts: list[str] = field(default_factory=list)

    def conflict(self, message: str) -> None:
        if len(self.conflicts) < MAX_CONFLICTS:
            self.conflicts.append(message)

    def as_dict(self) -> dict[str, Any]:
        payload = dataclasses.asdict(self)
        payload["truncated_conflicts"] = len(self.conflicts) >= MAX_CONFLICTS
        return payload


def _as_float(value: Any) -> float | None:
    try:
        return float(value) if value is not None else None
    except (TypeError, ValueError):
        return None


def _as_int(value: Any, default: int = 0) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def _parse_datetime(value: Any, fallback: datetime) -> datetime:
    if isinstance(value, str) and value:
        try:
            parsed = datetime.fromisoformat(value)
        except ValueError:
            return fallback
        return parsed if parsed.tzinfo else parsed.replace(tzinfo=UTC)
    return fallback


def _pick_id(db: Session, model: type, wanted: Any) -> str:
    """包内 id 能沿用就沿用（图片 id 必须稳定），被占用就换新 id。"""
    candidate = str(wanted or "").strip()
    if candidate and len(candidate) <= 64 and db.get(model, candidate) is None:
        return candidate
    return str(uuid4())


def _media_target(arcname: str) -> Path | None:
    if arcname.startswith("media/screenshots/"):
        return screenshots_dir_path()
    if arcname.startswith("media/note-images/"):
        return note_images_dir_path()
    return None


class _MediaWriter:
    """按需从包里流式读取媒体并落盘，已存在同内容则跳过。"""

    def __init__(self, plan: ImportPlan, stats: ImportStats, dry_run: bool) -> None:
        self._plan = plan
        self._stats = stats
        self._dry_run = dry_run
        self._archive = None if dry_run else open_archive(plan)
        self._index: dict[str, MediaEntry] = plan.media_by_arcname

    def close(self) -> None:
        if self._archive is not None:
            self._archive.close()
            self._archive = None

    def has(self, arcname: str) -> bool:
        """包里是否真有这个媒体（缺媒体时不该建出"打不开的截图"记录）。"""
        return bool(arcname) and arcname in self._index and _media_target(arcname) is not None

    def path_for(self, arcname: str, fallback_id: str) -> Path | None:
        """返回库里该记录应保存的绝对路径（必要时把文件写出去）。"""
        entry = self._index.get(arcname)
        directory = _media_target(arcname)
        if entry is None or directory is None:
            self._stats.conflict(f"包内缺少媒体或路径不受支持：{arcname}")
            return None

        filename = Path(arcname).name or f"{fallback_id}{entry.suffix or '.png'}"
        target = directory / filename
        if self._dry_run:
            self._stats.media_written += 1
            return target

        if target.is_file():
            digest = hashlib.sha256()
            with target.open("rb") as existing:
                while chunk := existing.read(1024 * 1024):
                    digest.update(chunk)
            if "sha256:" + digest.hexdigest() == entry.sha256:
                self._stats.media_skipped += 1
                return target
            self._stats.media_overwritten += 1
            self._stats.conflict(f"媒体内容不同，已覆盖：{filename}")

        assert self._archive is not None
        with self._archive.open(arcname) as source, target.open("wb") as sink:
            while chunk := source.read(1024 * 1024):
                sink.write(chunk)
        self._stats.media_written += 1
        return target


def _remove_file(file_path: str | None) -> None:
    if not file_path:
        return
    try:
        Path(file_path).unlink(missing_ok=True)
    except OSError:
        pass


def _purge_chapter_content(db: Session, chapter_id: str) -> None:
    """replace 策略：把章节现有内容清掉，再用包里的覆盖。

    截图行被删前要先删磁盘文件，否则会留下永远没人引用的孤儿文件。
    """
    db.query(TranscriptSegment).filter(TranscriptSegment.chapter_id == chapter_id).delete()
    db.query(Note).filter(Note.chapter_id == chapter_id).delete()
    for shot in db.query(Screenshot).filter(Screenshot.chapter_id == chapter_id).all():
        _remove_file(shot.file_path)
        db.delete(shot)
    db.query(ChapterSummary).filter(ChapterSummary.chapter_id == chapter_id).delete()
    db.query(ChapterMemo).filter(ChapterMemo.chapter_id == chapter_id).delete()
    db.flush()


def _import_chapters(
    db: Session,
    course: Course | SimpleNamespace,
    bundle: CourseDocument,
    media: _MediaWriter,
    user: User,
    stats: ImportStats,
    dry_run: bool,
    strategy: str = "merge",
) -> tuple[dict[str, Any], dict[str, str]]:
    """两遍走：先建/匹配章节，再补 parent_id（父可能排在后）。"""
    chapter_map: dict[str, Any] = {}
    for entry in bundle.document.get("chapters") or []:
        entry = entry or {}
        old_id = str(entry.get("id") or "")
        external_id = str(entry.get("external_chapter_id") or "")
        existing = (
            db.query(Chapter)
            .filter(Chapter.course_id == course.id, Chapter.external_chapter_id == external_id)
            .first()
        )
        if existing is not None:
            stats.chapters_matched += 1
            if not existing.title and entry.get("title"):
                existing.title = str(entry["title"])
            if strategy == "replace" and not dry_run:
                _purge_chapter_content(db, str(existing.id))
            chapter_map[old_id] = existing
            continue

        stats.chapters_created += 1
        if dry_run:
            chapter_map[old_id] = SimpleNamespace(id=f"dry-chapter-{old_id or external_id}", parent_id=None)
            continue
        chapter = Chapter(
            id=_pick_id(db, Chapter, old_id),
            course_id=course.id,
            external_chapter_id=external_id,
            title=str(entry.get("title") or external_id or "未命名章节"),
            sort_order=_as_int(entry.get("sort_order")),
            duration_seconds=_as_int(entry["duration_seconds"]) if entry.get("duration_seconds") is not None else None,
            extra=dict(entry.get("metadata") or {}),
        )
        db.add(chapter)
        db.flush()
        chapter_map[old_id] = chapter

    if not dry_run:
        for entry in bundle.document.get("chapters") or []:
            entry = entry or {}
            parent_old = entry.get("parent_id")
            child = chapter_map.get(str(entry.get("id") or ""))
            parent = chapter_map.get(str(parent_old)) if parent_old else None
            if child is not None and parent is not None and getattr(child, "parent_id", None) is None:
                child.parent_id = parent.id

    return chapter_map, {old: str(row.id) for old, row in chapter_map.items()}


def _import_chapter_content(
    db: Session,
    course_id: str,
    chapter_id: str,
    document: dict,
    media: _MediaWriter,
    user: User,
    stats: ImportStats,
    dry_run: bool,
) -> dict[str, str]:
    """导入一个章节下的字幕/笔记/截图/图片/摘要/备忘，返回 note_id 映射。"""
    notes_by_key: set[tuple[str, float]] = set()
    transcripts_by_key: set[tuple[float, str]] = set()

    if chapter_id:
        for note in db.query(Note).filter(Note.chapter_id == chapter_id).all():
            notes_by_key.add((note.content, _as_float(note.video_time_seconds) or 0.0))
        for segment in db.query(TranscriptSegment).filter(TranscriptSegment.chapter_id == chapter_id).all():
            transcripts_by_key.add((_as_float(segment.start_seconds) or 0.0, segment.text))

    note_map: dict[str, str] = {}

    for segment in document.get("transcripts") or []:
        key = (_as_float(segment.get("start_seconds")) or 0.0, str(segment.get("text") or ""))
        if not key[1] or key in transcripts_by_key:
            stats.transcripts_skipped += 1
            continue
        transcripts_by_key.add(key)
        stats.transcripts_added += 1
        if dry_run or not chapter_id:
            continue
        db.add(
            TranscriptSegment(
                course_id=course_id,
                chapter_id=chapter_id,
                start_seconds=key[0],
                end_seconds=_as_float(segment.get("end_seconds")),
                text=key[1],
                source=str(segment.get("source") or "import"),
            )
        )

    for note_doc in document.get("notes") or []:
        content = str(note_doc.get("content") or "")
        key = (content, _as_float(note_doc.get("video_time_seconds")) or 0.0)
        if key in notes_by_key:
            stats.notes_skipped += 1
            if note_doc.get("id"):
                note_map[str(note_doc["id"])] = ""
            continue
        notes_by_key.add(key)
        stats.notes_added += 1
        if dry_run or not chapter_id:
            continue
        note = Note(
            course_id=course_id,
            chapter_id=chapter_id,
            user_id=user.id,
            video_time_seconds=_as_float(note_doc.get("video_time_seconds")),
            content=content,
            corrected_content=note_doc.get("corrected_content"),
            tags=list(note_doc.get("tags") or []),
            created_at=_parse_datetime(note_doc.get("created_at"), datetime.now(UTC)),
        )
        db.add(note)
        db.flush()
        if note_doc.get("id"):
            note_map[str(note_doc["id"])] = str(note.id)

    for shot_doc in document.get("screenshots") or []:
        wanted_id = str(shot_doc.get("id") or "")
        arcname = str(shot_doc.get("file") or "")
        if wanted_id and db.get(Screenshot, wanted_id) is not None:
            stats.screenshots_skipped += 1
            continue
        if not media.has(arcname):
            stats.conflict(f"截图缺少媒体文件，已跳过：{arcname or wanted_id}")
            continue
        stats.screenshots_added += 1
        if dry_run or not chapter_id:
            continue
        target = media.path_for(arcname, wanted_id)
        if target is None:
            continue
        db.add(
            Screenshot(
                id=_pick_id(db, Screenshot, wanted_id),
                organization_id=_organization_id_of_course(db, course_id),
                course_id=course_id,
                chapter_id=chapter_id,
                user_id=user.id,
                video_time_seconds=_as_float(shot_doc.get("video_time_seconds")),
                ocr_text=shot_doc.get("ocr_text"),
                file_path=str(target),
                created_at=_parse_datetime(shot_doc.get("created_at"), datetime.now(UTC)),
            )
        )

    for image_doc in document.get("note_images") or []:
        wanted_id = str(image_doc.get("id") or "")
        arcname = str(image_doc.get("file") or "")
        if wanted_id and db.get(NoteImage, wanted_id) is not None:
            stats.note_images_skipped += 1
            continue
        if not media.has(arcname):
            stats.conflict(f"笔记图片缺少媒体文件，已跳过：{arcname or wanted_id}")
            continue
        stats.note_images_added += 1
        if dry_run or not chapter_id:
            continue
        target = media.path_for(arcname, wanted_id)
        if target is None:
            continue
        db.add(
            NoteImage(
                id=_pick_id(db, NoteImage, wanted_id),
                organization_id=_organization_id_of_course(db, course_id),
                user_id=user.id,
                file_path=str(target),
                created_at=_parse_datetime(image_doc.get("created_at"), datetime.now(UTC)),
            )
        )

    if chapter_id:
        summary_doc = document.get("chapter_summary")
        if isinstance(summary_doc, dict):
            exists = db.query(ChapterSummary).filter(ChapterSummary.chapter_id == chapter_id).first()
            if exists is None:
                stats.summaries_added += 1
                if not dry_run:
                    db.add(
                        ChapterSummary(
                            chapter_id=chapter_id,
                            course_id=course_id,
                            summary_md=str(summary_doc.get("summary_md") or ""),
                            outline=list(summary_doc.get("outline") or []),
                            key_points=list(summary_doc.get("key_points") or []),
                            model=str(summary_doc.get("model") or "import"),
                            status=str(summary_doc.get("status") or "done"),
                        )
                    )
        memo_doc = document.get("memo")
        if isinstance(memo_doc, dict):
            exists = db.query(ChapterMemo).filter(ChapterMemo.chapter_id == chapter_id).first()
            if exists is None:
                stats.memos_added += 1
                if not dry_run:
                    db.add(
                        ChapterMemo(
                            chapter_id=chapter_id,
                            course_id=course_id,
                            content_md=str(memo_doc.get("content_md") or ""),
                        )
                    )

    return note_map


def _organization_id_of_course(db: Session, course_id: str) -> str:
    course = db.get(Course, course_id)
    if course is None:  # dry-run 不会有真实课程
        return ""
    return course.organization_id


def _import_cards_and_quiz(
    db: Session,
    course_id: str,
    bundle: CourseDocument,
    chapter_ids: dict[str, str],
    note_ids: dict[str, str],
    user: User,
    organization_id: str,
    stats: ImportStats,
    dry_run: bool,
) -> None:
    existing_fronts = {
        card.front for card in db.query(ReviewCard.front).filter(ReviewCard.course_id == course_id).all()
    }
    for card_doc in bundle.cards:
        front = str(card_doc.get("front") or "")
        if not front or front in existing_fronts:
            stats.cards_skipped += 1
            continue
        existing_fronts.add(front)
        stats.cards_added += 1
        if dry_run:
            continue
        db.add(
            ReviewCard(
                organization_id=organization_id,
                course_id=course_id,
                chapter_id=chapter_ids.get(str(card_doc.get("chapter_id") or "")) or None,
                note_id=note_ids.get(str(card_doc.get("note_id") or "")) or None,
                user_id=user.id,
                front=front,
                back=str(card_doc.get("back") or ""),
                ease_factor=float(card_doc.get("ease_factor") or 2.5),
                interval_days=_as_int(card_doc.get("interval_days")),
                due_at=_parse_datetime(card_doc.get("due_at"), datetime.now(UTC)),
                review_count=_as_int(card_doc.get("review_count")),
                suspended=bool(card_doc.get("suspended")),
            )
        )

    existing_questions = {
        (question.chapter_id, question.question)
        for question in db.query(QuizQuestion).filter(QuizQuestion.course_id == course_id).all()
    }
    for quiz_doc in bundle.quiz:
        question_text = str(quiz_doc.get("question") or "")
        chapter_id = chapter_ids.get(str(quiz_doc.get("chapter_id") or "")) or None
        if not question_text or (chapter_id, question_text) in existing_questions:
            stats.quiz_skipped += 1
            continue
        existing_questions.add((chapter_id, question_text))
        stats.quiz_added += 1
        if dry_run or chapter_id is None:
            continue
        db.add(
            QuizQuestion(
                course_id=course_id,
                chapter_id=chapter_id,
                question_type=str(quiz_doc.get("question_type") or "single_choice"),
                question=question_text,
                options=list(quiz_doc.get("options") or []),
                answer=str(quiz_doc.get("answer") or ""),
                explanation=quiz_doc.get("explanation"),
                model=str(quiz_doc.get("model") or "import"),
            )
        )


def _import_course(
    db: Session,
    organization: Organization,
    user: User,
    bundle: CourseDocument,
    media: _MediaWriter,
    stats: ImportStats,
    dry_run: bool,
    strategy: str = "merge",
) -> None:
    document = bundle.document
    site_info = document.get("site") or {}
    adapter_id = str(site_info.get("adapter_id") or "").strip() or "imported"
    external_course_id = str(document.get("external_course_id") or "")
    # new：强制新建一份副本，外部 id 加后缀避免撞唯一约束
    if strategy == "new":
        external_course_id = f"{external_course_id}-import-{uuid4().hex[:8]}"

    site = db.query(Site).filter(Site.adapter_id == adapter_id).first()
    if site is None:
        stats.conflict(f"站点不存在，已按包内信息新建：{adapter_id}")
        if dry_run:
            site = SimpleNamespace(id=f"dry-site-{adapter_id}")
        else:
            site = Site(
                adapter_id=adapter_id,
                name=str(site_info.get("name") or adapter_id),
                host_patterns=dict(site_info.get("host_patterns") or {}),
                status="enabled",
            )
            db.add(site)
            db.flush()

    course = None
    if strategy != "new":
        course = (
            db.query(Course)
            .filter(
                Course.organization_id == organization.id,
                Course.site_id == site.id,
                Course.external_course_id == external_course_id,
            )
            .first()
        )
    if course is not None:
        stats.courses_matched += 1
        if not course.title and document.get("title"):
            course.title = str(document["title"])
        if not course.term and document.get("term"):
            course.term = str(document["term"])
        if not (course.extra or {}) and document.get("metadata"):
            course.extra = dict(document["metadata"])
    else:
        stats.courses_created += 1
        if dry_run:
            course = SimpleNamespace(id=f"dry-course-{document.get('id') or external_course_id}")
        else:
            course = Course(
                id=_pick_id(db, Course, document.get("id")),
                organization_id=organization.id,
                site_id=site.id,
                external_course_id=external_course_id,
                title=str(document.get("title") or external_course_id or "未命名课程"),
                term=document.get("term"),
                extra=dict(document.get("metadata") or {}),
            )
            db.add(course)
            db.flush()

    if strategy == "replace" and not dry_run and stats.courses_matched:
        # 覆盖模式：课程级的卡片/题目/无章节笔记与截图整体换成本包的
        db.query(ReviewCard).filter(ReviewCard.course_id == course.id).delete()
        db.query(QuizQuestion).filter(QuizQuestion.course_id == course.id).delete()
        db.query(Note).filter(Note.course_id == course.id, Note.chapter_id.is_(None)).delete()
        for shot in db.query(Screenshot).filter(Screenshot.course_id == course.id, Screenshot.chapter_id.is_(None)).all():
            _remove_file(shot.file_path)
            db.delete(shot)
        db.flush()

    chapter_map, chapter_ids = _import_chapters(db, course, bundle, media, user, stats, dry_run, strategy)

    note_ids: dict[str, str] = {}
    course_level_notes = {
        "notes": document.get("notes") or [],
        "screenshots": document.get("screenshots") or [],
        "note_images": document.get("note_images") or [],
    }
    note_ids.update(_import_chapter_content(db, str(course.id), "", course_level_notes, media, user, stats, dry_run))
    for chapter_old_id, chapter_doc in bundle.chapters.items():
        chapter_row = chapter_map.get(chapter_old_id)
        if chapter_row is None:
            continue
        note_ids.update(
            _import_chapter_content(
                db, str(course.id), str(chapter_row.id), chapter_doc, media, user, stats, dry_run
            )
        )

    if not dry_run:
        summary_doc = document.get("summary")
        if isinstance(summary_doc, dict):
            exists = db.query(CourseSummary).filter(CourseSummary.course_id == course.id).first()
            if exists is None:
                db.add(
                    CourseSummary(
                        course_id=course.id,
                        summary_md=str(summary_doc.get("summary_md") or ""),
                        outline=list(summary_doc.get("outline") or []),
                        key_points=list(summary_doc.get("key_points") or []),
                        model=str(summary_doc.get("model") or "import"),
                        status=str(summary_doc.get("status") or "done"),
                    )
                )
                stats.summaries_added += 1

    _import_cards_and_quiz(
        db,
        str(course.id),
        bundle,
        chapter_ids,
        note_ids,
        user,
        organization.id,
        stats,
        dry_run,
    )


def run_import(
    db: Session,
    organization: Organization,
    user: User,
    plan: ImportPlan,
    *,
    dry_run: bool = False,
    strategy: str = "merge",
    on_progress: Callable[[int], None] | None = None,
    should_cancel: Callable[[], bool] | None = None,
) -> dict[str, Any]:
    """执行导入；dry_run=True 时只统计不写库。

    strategy:
    - merge（默认）只增不覆盖
    - new   强制新建副本，课程外部 id 加后缀
    - replace 复用同名课程/章节，但章节内容与课程级卡片/题目整体换成包里的
    """
    if strategy not in SUPPORTED_STRATEGIES:
        raise ValueError(f"不支持的导入策略：{strategy}")
    stats = ImportStats(dry_run=dry_run, strategy=strategy, counts_expected=dict(plan.counts))
    media = _MediaWriter(plan, stats, dry_run)
    total = max(len(plan.courses), 1)
    try:
        for index, bundle in enumerate(plan.courses, start=1):
            if should_cancel is not None and should_cancel():
                stats.conflict("导入被取消，已完成的课程保留")
                raise CancelledError()
            _import_course(db, organization, user, bundle, media, stats, dry_run, strategy)
            if dry_run:
                db.rollback()
            else:
                # 每门课程一个事务：一门失败不影响其它课程
                db.commit()
            if on_progress is not None:
                on_progress(int(index * 100 / total))
    except CancelledError:
        db.rollback()
        raise
    except Exception:
        db.rollback()
        raise
    finally:
        media.close()
    return stats.as_dict()


class CancelledError(Exception):
    """导入过程中收到取消请求。"""
