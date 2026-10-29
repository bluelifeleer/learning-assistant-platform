"""把一门课程合并进另一门。

重复采集会造出同一门课的多个副本（外部 id 不同，或换了站点）。归档能藏起副本，
但数据仍分散着：字幕在 A、笔记在 B。合并就是把这些都归到目标课程，然后删掉来源。

处理难点是几处唯一约束与引用：
- `chapters(course_id, external_chapter_id)`：同外部 id 的章节要并成一章，
  子数据（字幕/笔记/截图/题目/作答/会话/子章节）改挂到保留的那章上
- `chapter_summaries.chapter_id` / `chapter_memos.chapter_id` / `course_summaries.course_id`：
  两边都有时保留目标那份；备忘是用户手写的，两段都留（拼接）
- 复习卡与题目没有数据库唯一约束，但语义上重复（同正面 / 同章同题干），按内容去重，
  重复题对应的作答记录一并清掉，避免悬空引用

媒体文件不动：截图 file_path 指向磁盘上的文件，只改行的归属。
"""

from __future__ import annotations

from typing import Any

from sqlalchemy.orm import Session

from app.models.entities import (
    AiTask,
    Chapter,
    ChapterMemo,
    ChapterSummary,
    Course,
    CourseSummary,
    Export,
    ImportJob,
    Note,
    QuizAttempt,
    QuizQuestion,
    ReviewCard,
    Screenshot,
    TranscriptSegment,
    VideoSession,
)

#: 合并时"整体改挂到目标课程"的表（章节单独处理）
COURSE_SCOPED_MODELS = (
    Chapter,
    TranscriptSegment,
    Note,
    Screenshot,
    VideoSession,
    ReviewCard,
    QuizQuestion,
    QuizAttempt,
    AiTask,
    ChapterSummary,
    ChapterMemo,
    CourseSummary,
)

#: 挂在章节下的表：合并重复章节时要把 chapter_id 一起改到保留章节上
CHAPTER_SCOPED_MODELS = (TranscriptSegment, Note, Screenshot, VideoSession, QuizQuestion, QuizAttempt)


def merge_courses(db: Session, source: Course, target: Course) -> dict[str, Any]:
    """把 source 的全部内容并到 target，然后删除 source。调用方负责提交事务。"""
    stats: dict[str, Any] = {
        "merged_into": target.id,
        "deleted_course": source.id,
        "chapters_moved": 0,
        "chapters_merged": 0,
        "summaries_dropped": 0,
        "memos_merged": 0,
        "cards_dropped": 0,
        "questions_dropped": 0,
    }

    _merge_chapters(db, source, target, stats)
    # 课程级摘要唯一：目标已有就先删来源的，否则留给下面的批量改挂
    _prepare_course_summary(db, source, target, stats)
    _move_remaining_rows(db, source, target)
    _dedupe_cards_and_questions(db, target, stats)
    _detach_references(db, source)

    db.delete(source)
    return stats


def _merge_chapters(db: Session, source: Course, target: Course, stats: dict[str, Any]) -> None:
    """同 external_chapter_id 的章节并进目标那一章，其余整章改挂到目标课程。"""
    existing_by_external = {
        chapter.external_chapter_id: chapter
        for chapter in db.query(Chapter).filter(Chapter.course_id == target.id).all()
    }
    removed_chapter_ids: list[str] = []

    for chapter in db.query(Chapter).filter(Chapter.course_id == source.id).all():
        kept = existing_by_external.get(chapter.external_chapter_id)
        if kept is None:
            chapter.course_id = target.id
            existing_by_external[chapter.external_chapter_id] = chapter
            stats["chapters_moved"] += 1
            continue

        stats["chapters_merged"] += 1
        for model in CHAPTER_SCOPED_MODELS:
            db.query(model).filter(model.chapter_id == chapter.id).update(
                {"course_id": target.id, "chapter_id": kept.id}, synchronize_session=False
            )
        # AI 任务的章节上下文允许为空，改到保留章节上避免悬空
        db.query(AiTask).filter(AiTask.chapter_id == chapter.id).update(
            {"course_id": target.id, "chapter_id": kept.id}, synchronize_session=False
        )
        # 子章节改挂到保留章节，避免 parent_id 悬空
        db.query(Chapter).filter(Chapter.parent_id == chapter.id).update(
            {"parent_id": kept.id}, synchronize_session=False
        )
        _merge_chapter_summary(db, chapter.id, kept.id, target.id, stats)
        _merge_chapter_memo(db, chapter.id, kept.id, target.id, stats)
        removed_chapter_ids.append(chapter.id)
        db.delete(chapter)

    db.flush()
    if removed_chapter_ids:
        _drop_orphan_ai_tasks(db, removed_chapter_ids)


def _drop_orphan_ai_tasks(db: Session, chapter_ids: list[str]) -> None:
    """被删章节上还留着指向它的 AI 任务时，把章节引用置空（任务是历史记录，保留）。"""
    db.query(AiTask).filter(AiTask.chapter_id.in_(chapter_ids)).update(
        {"chapter_id": None}, synchronize_session=False
    )


def _merge_chapter_summary(
    db: Session, source_chapter_id: str, target_chapter_id: str, target_course_id: str, stats: dict[str, Any]
) -> None:
    source_summary = db.query(ChapterSummary).filter(ChapterSummary.chapter_id == source_chapter_id).first()
    if source_summary is None:
        return
    if db.query(ChapterSummary).filter(ChapterSummary.chapter_id == target_chapter_id).first() is not None:
        db.delete(source_summary)
        stats["summaries_dropped"] += 1
    else:
        source_summary.chapter_id = target_chapter_id
        source_summary.course_id = target_course_id


def _merge_chapter_memo(
    db: Session, source_chapter_id: str, target_chapter_id: str, target_course_id: str, stats: dict[str, Any]
) -> None:
    source_memo = db.query(ChapterMemo).filter(ChapterMemo.chapter_id == source_chapter_id).first()
    if source_memo is None:
        return
    target_memo = db.query(ChapterMemo).filter(ChapterMemo.chapter_id == target_chapter_id).first()
    if target_memo is None:
        source_memo.chapter_id = target_chapter_id
        source_memo.course_id = target_course_id
        return
    # 备忘是手写内容，两边都有时按顺序拼接，不丢用户的字
    if source_memo.content_md and source_memo.content_md not in (target_memo.content_md or ""):
        separator = "\n\n---\n\n" if target_memo.content_md else ""
        target_memo.content_md = f"{target_memo.content_md or ''}{separator}{source_memo.content_md}"
        stats["memos_merged"] += 1
    db.delete(source_memo)


def _prepare_course_summary(db: Session, source: Course, target: Course, stats: dict[str, Any]) -> None:
    source_summary = db.query(CourseSummary).filter(CourseSummary.course_id == source.id).first()
    if source_summary is None:
        return
    if db.query(CourseSummary).filter(CourseSummary.course_id == target.id).first() is not None:
        db.delete(source_summary)
        stats["summaries_dropped"] += 1
        db.flush()


def _move_remaining_rows(db: Session, source: Course, target: Course) -> None:
    """章节去重之后再整体改挂：还指向来源课程的行一律改成目标课程。"""
    for model in COURSE_SCOPED_MODELS:
        db.query(model).filter(model.course_id == source.id).update(
            {"course_id": target.id}, synchronize_session=False
        )
    db.flush()


def _dedupe_cards_and_questions(db: Session, target: Course, stats: dict[str, Any]) -> None:
    seen_fronts: set[str] = set()
    for card in (
        db.query(ReviewCard).filter(ReviewCard.course_id == target.id).order_by(ReviewCard.created_at.asc()).all()
    ):
        key = (card.front or "").strip()
        if key in seen_fronts:
            db.delete(card)
            stats["cards_dropped"] += 1
            continue
        seen_fronts.add(key)

    seen_questions: set[tuple[str, str]] = set()
    removed_questions: list[str] = []
    for question in (
        db.query(QuizQuestion)
        .filter(QuizQuestion.course_id == target.id)
        .order_by(QuizQuestion.created_at.asc())
        .all()
    ):
        key = (question.chapter_id or "", (question.question or "").strip())
        if key in seen_questions:
            removed_questions.append(question.id)
            db.delete(question)
            stats["questions_dropped"] += 1
            continue
        seen_questions.add(key)

    if removed_questions:
        # 作答记录指向被删的重复题：一并删掉，避免悬空引用
        db.query(QuizAttempt).filter(QuizAttempt.question_id.in_(removed_questions)).delete(
            synchronize_session=False
        )
    db.flush()


def _detach_references(db: Session, source: Course) -> None:
    """导出记录 / 导入任务只是引用课程，不能跟着删。"""
    db.query(Export).filter(Export.course_id == source.id).update({"course_id": None}, synchronize_session=False)
    db.query(ImportJob).filter(ImportJob.target_course_id == source.id).update(
        {"target_course_id": None}, synchronize_session=False
    )
