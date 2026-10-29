"""把课程数据组装成导出文档。

JSON / Markdown / 学习档案 PDF / .lapkg 包共用这一个组装层，避免各处各取一套字段。
包格式规范见 docs/superpowers/specs/2026-10-28-import-export-package.md。
"""

from __future__ import annotations

import re
from collections.abc import Callable, Iterable
from dataclasses import dataclass, field
from datetime import UTC, datetime
from pathlib import Path

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
)
from app.services.video_sources import latest_video_events_by_chapter, video_export_info

SCHEMA_VERSION = 1

#: 写进包的 app_version；与 pyproject.toml / FastAPI(title, version=…) 保持一致
APP_VERSION = "0.1.0"

# 笔记正文用 ![alt](note-image:<uuid>) 引用图片；导入端必须保留这些 id，
# 否则历史笔记里的图片会全部裂掉（见规范 §7.2）。
NOTE_IMAGE_PATTERN = re.compile(r"note-image:([A-Za-z0-9-]+)")
MEDIA_SUFFIXES = {".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp"}

#: (arcname, 原始文件路径) -> 登记后的引用字段 {"file": arcname}
MediaCollector = Callable[[str, str], dict]


def isoformat(value: datetime | None) -> str | None:
    if value is None:
        return None
    if value.tzinfo is None:
        value = value.replace(tzinfo=UTC)
    return value.isoformat()


def as_seconds(value) -> float | None:
    return float(value) if value is not None else None


def note_image_ids_in(*texts: str | None) -> set[str]:
    ids: set[str] = set()
    for text in texts:
        ids.update(NOTE_IMAGE_PATTERN.findall(text or ""))
    return ids


def media_suffix(file_path: str) -> str:
    suffix = Path(file_path).suffix.lower()
    return suffix if suffix in MEDIA_SUFFIXES else ".png"


@dataclass
class MediaFile:
    arcname: str
    path: Path


@dataclass
class CourseBundle:
    #: 写入 courses/<course_id>/course.json
    document: dict
    #: chapter_id -> 写入 courses/<course_id>/chapters/<chapter_id>.json
    chapters: dict[str, dict] = field(default_factory=dict)
    #: 写入 courses/<course_id>/cards.json
    cards: list[dict] = field(default_factory=list)
    #: 写入 courses/<course_id>/quiz.json
    quiz: list[dict] = field(default_factory=list)


@dataclass
class ExportBundle:
    organization_id: str
    organization_name: str
    exported_at: datetime
    include_media: bool = True
    courses: list[CourseBundle] = field(default_factory=list)
    media: list[MediaFile] = field(default_factory=list)
    #: 库里有记录但磁盘上找不到的媒体文件
    missing_media: list[str] = field(default_factory=list)
    counts: dict[str, int] = field(default_factory=dict)


def empty_counts() -> dict[str, int]:
    return {
        "courses": 0,
        "chapters": 0,
        "transcripts": 0,
        "notes": 0,
        "screenshots": 0,
        "note_images": 0,
        "cards": 0,
        "quiz_questions": 0,
    }


def _note_document(note: Note) -> dict:
    return {
        "id": note.id,
        "user_id": note.user_id,
        "chapter_id": note.chapter_id,
        "video_time_seconds": as_seconds(note.video_time_seconds),
        "content": note.content,
        "corrected_content": note.corrected_content,
        "tags": list(note.tags or []),
        "created_at": isoformat(note.created_at),
    }


def _note_image_documents(
    db: Session,
    notes: Iterable[dict],
    collect_media: MediaCollector,
) -> list[dict]:
    referenced: set[str] = set()
    for note in notes:
        referenced |= note_image_ids_in(note.get("content"), note.get("corrected_content"))
    if not referenced:
        return []
    images = db.query(NoteImage).filter(NoteImage.id.in_(referenced)).order_by(NoteImage.created_at.asc()).all()
    return [
        {
            "id": image.id,
            "user_id": image.user_id,
            "created_at": isoformat(image.created_at),
            **collect_media(f"media/note-images/{image.id}{media_suffix(image.file_path)}", image.file_path),
        }
        for image in images
    ]


def _screenshot_documents(db: Session, chapter_id: str, collect_media: MediaCollector) -> list[dict]:
    documents: list[dict] = []
    shots = (
        db.query(Screenshot)
        .filter(Screenshot.chapter_id == chapter_id)
        .order_by(Screenshot.created_at.asc())
        .all()
    )
    for shot in shots:
        arcname = f"media/screenshots/{shot.id}{media_suffix(shot.file_path)}"
        documents.append(
            {
                "id": shot.id,
                "chapter_id": shot.chapter_id,
                "user_id": shot.user_id,
                "video_time_seconds": as_seconds(shot.video_time_seconds),
                "ocr_text": shot.ocr_text,
                "created_at": isoformat(shot.created_at),
                **collect_media(arcname, shot.file_path),
            }
        )
    return documents


def _chapter_document(
    db: Session,
    chapter: Chapter,
    collect_media: MediaCollector,
    video: dict | None,
) -> dict:
    transcripts = [
        {
            "id": segment.id,
            "start_seconds": as_seconds(segment.start_seconds),
            "end_seconds": as_seconds(segment.end_seconds),
            "text": segment.text,
            "source": segment.source,
            "created_at": isoformat(segment.created_at),
        }
        for segment in db.query(TranscriptSegment)
        .filter(TranscriptSegment.chapter_id == chapter.id)
        .order_by(TranscriptSegment.start_seconds.asc())
        .all()
    ]
    notes = [
        _note_document(note)
        for note in db.query(Note).filter(Note.chapter_id == chapter.id).order_by(Note.created_at.asc()).all()
    ]
    summary = db.query(ChapterSummary).filter(ChapterSummary.chapter_id == chapter.id).first()
    memo = db.query(ChapterMemo).filter(ChapterMemo.chapter_id == chapter.id).first()
    return {
        "id": chapter.id,
        "external_chapter_id": chapter.external_chapter_id,
        "title": chapter.title,
        "video": video,
        "transcripts": transcripts,
        "notes": notes,
        "screenshots": _screenshot_documents(db, chapter.id, collect_media),
        "note_images": _note_image_documents(db, notes, collect_media),
        "chapter_summary": (
            {
                "summary_md": summary.summary_md,
                "outline": list(summary.outline or []),
                "key_points": list(summary.key_points or []),
                "model": summary.model,
                "status": summary.status,
                "updated_at": isoformat(summary.updated_at),
            }
            if summary
            else None
        ),
        "memo": {"content_md": memo.content_md, "updated_at": isoformat(memo.updated_at)} if memo else None,
    }


def _course_bundle(db: Session, course: Course, collect_media: MediaCollector, counts: dict[str, int]) -> CourseBundle:
    site = db.get(Site, course.site_id)
    chapters = (
        db.query(Chapter)
        .filter(Chapter.course_id == course.id)
        .order_by(Chapter.sort_order.asc(), Chapter.title.asc())
        .all()
    )
    video_events = latest_video_events_by_chapter(db, course)

    chapter_entries: list[dict] = []
    chapter_documents: dict[str, dict] = {}
    for chapter in chapters:
        event = video_events.get(chapter.external_chapter_id)
        document = _chapter_document(db, chapter, collect_media, video_export_info(event) if event else None)
        chapter_documents[chapter.id] = document
        chapter_entries.append(
            {
                "id": chapter.id,
                "parent_id": chapter.parent_id,
                "external_chapter_id": chapter.external_chapter_id,
                "title": chapter.title,
                "sort_order": chapter.sort_order,
                "duration_seconds": chapter.duration_seconds,
                "metadata": dict(chapter.extra or {}),
            }
        )
        counts["chapters"] += 1
        counts["transcripts"] += len(document["transcripts"])
        counts["notes"] += len(document["notes"])
        counts["screenshots"] += len(document["screenshots"])
        counts["note_images"] += len(document["note_images"])

    # 没有挂到章节上的笔记/截图也随课程带走，否则会悄悄丢数据
    loose_notes = [
        _note_document(note)
        for note in db.query(Note)
        .filter(Note.course_id == course.id, Note.chapter_id.is_(None))
        .order_by(Note.created_at.asc())
        .all()
    ]
    loose_images = _note_image_documents(db, loose_notes, collect_media)
    loose_screenshots = [
        {
            "id": shot.id,
            "chapter_id": None,
            "user_id": shot.user_id,
            "video_time_seconds": as_seconds(shot.video_time_seconds),
            "ocr_text": shot.ocr_text,
            "created_at": isoformat(shot.created_at),
            **collect_media(
                f"media/screenshots/{shot.id}{media_suffix(shot.file_path)}", shot.file_path
            ),
        }
        for shot in db.query(Screenshot)
        .filter(Screenshot.course_id == course.id, Screenshot.chapter_id.is_(None))
        .order_by(Screenshot.created_at.asc())
        .all()
    ]
    counts["notes"] += len(loose_notes)
    counts["note_images"] += len(loose_images)
    counts["screenshots"] += len(loose_screenshots)

    course_summary = db.query(CourseSummary).filter(CourseSummary.course_id == course.id).first()
    document = {
        "id": course.id,
        "site": {
            "adapter_id": site.adapter_id if site else "",
            "name": site.name if site else "",
            "host_patterns": dict(site.host_patterns or {}) if site else {},
        },
        "external_course_id": course.external_course_id,
        "title": course.title,
        "term": course.term,
        "metadata": dict(course.extra or {}),
        "archived": course.archived_at is not None,
        "chapters": chapter_entries,
        "summary": (
            {
                "summary_md": course_summary.summary_md,
                "outline": list(course_summary.outline or []),
                "key_points": list(course_summary.key_points or []),
                "model": course_summary.model,
                "status": course_summary.status,
                "updated_at": isoformat(course_summary.updated_at),
            }
            if course_summary
            else None
        ),
        "notes": loose_notes,
        "screenshots": loose_screenshots,
        "note_images": loose_images,
    }

    cards = [
        {
            "id": card.id,
            "chapter_id": card.chapter_id,
            "note_id": card.note_id,
            "front": card.front,
            "back": card.back,
            "ease_factor": card.ease_factor,
            "interval_days": card.interval_days,
            "due_at": isoformat(card.due_at),
            "review_count": card.review_count,
            "suspended": card.suspended,
            "created_at": isoformat(card.created_at),
        }
        for card in db.query(ReviewCard)
        .filter(ReviewCard.course_id == course.id)
        .order_by(ReviewCard.created_at.asc())
        .all()
    ]
    quiz = [
        {
            "id": question.id,
            "chapter_id": question.chapter_id,
            "question_type": question.question_type,
            "question": question.question,
            "options": list(question.options or []),
            "answer": question.answer,
            "explanation": question.explanation,
            "model": question.model,
            "created_at": isoformat(question.created_at),
        }
        for question in db.query(QuizQuestion)
        .filter(QuizQuestion.course_id == course.id)
        .order_by(QuizQuestion.created_at.asc())
        .all()
    ]
    counts["cards"] += len(cards)
    counts["quiz_questions"] += len(quiz)

    return CourseBundle(document=document, chapters=chapter_documents, cards=cards, quiz=quiz)


def build_export_bundle(
    db: Session,
    organization: Organization,
    courses: list[Course],
    *,
    include_media: bool,
) -> ExportBundle:
    bundle = ExportBundle(
        organization_id=organization.id,
        organization_name=organization.name,
        exported_at=datetime.now(UTC),
        include_media=include_media,
        counts=empty_counts(),
    )
    seen: set[str] = set()

    def collect_media(arcname: str, file_path: str) -> dict:
        if not include_media:
            return {}
        if arcname not in seen:
            seen.add(arcname)
            path = Path(file_path)
            if path.is_file():
                bundle.media.append(MediaFile(arcname=arcname, path=path))
            else:
                bundle.missing_media.append(file_path)
        return {"file": arcname}

    for course in courses:
        bundle.courses.append(_course_bundle(db, course, collect_media, bundle.counts))
        bundle.counts["courses"] += 1
    return bundle


def markdown_document(bundle: ExportBundle, index: int = 0) -> dict:
    """把包模型压回 Markdown/JSON 导出沿用的精简结构（保持既有输出不变）。"""
    course = bundle.courses[index]
    document = course.document
    chapters = []
    for entry in document["chapters"]:
        chapter = course.chapters.get(entry["id"], {})
        chapters.append(
            {
                "title": entry["title"],
                "video": chapter.get("video"),
                "transcripts": chapter.get("transcripts", []),
                "notes": chapter.get("notes", []),
            }
        )
    # 没挂章节的笔记单独成节，避免在 Markdown/JSON 里消失
    if document.get("notes"):
        chapters.append({"title": "课程级笔记", "video": None, "transcripts": [], "notes": document["notes"]})
    return {"title": document["title"], "chapters": chapters}
