from collections.abc import Callable

from fastapi import BackgroundTasks
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.db.session import SessionLocal
from app.models.entities import AiTask, Chapter, ChapterSummary, Course, Organization, TranscriptSegment
from app.services import ai_ocr, ai_pipeline, llm
from app.services.digest import send_digest
from app.services.review import utc_now

TASK_CHAPTER_SUMMARY = "chapter_summary"
TASK_COURSE_SUMMARY = "course_summary"
TASK_QUIZ = "quiz"
TASK_FLASHCARDS = "flashcards"
TASK_EMAIL_DIGEST = "email_digest"
TASK_CHAPTER_OCR = "chapter_ocr"
TASK_TYPES = {TASK_CHAPTER_SUMMARY, TASK_COURSE_SUMMARY, TASK_QUIZ, TASK_FLASHCARDS, TASK_EMAIL_DIGEST, TASK_CHAPTER_OCR}

AUTO_MIN_SEGMENTS = 20


def find_active_task(db: Session, task_type: str, course_id: str, chapter_id: str | None = None) -> AiTask | None:
    return (
        db.query(AiTask)
        .filter(
            AiTask.task_type == task_type,
            AiTask.course_id == course_id,
            AiTask.chapter_id == chapter_id,
            AiTask.status.in_(["pending", "running"]),
        )
        .first()
    )


def create_task(db: Session, organization_id: str, task_type: str, course_id: str | None, chapter_id: str | None = None) -> tuple[AiTask, bool]:
    existing = find_active_task(db, task_type, course_id, chapter_id)
    if existing:
        return existing, False
    task = AiTask(organization_id=organization_id, task_type=task_type, course_id=course_id, chapter_id=chapter_id, status="pending")
    db.add(task)
    try:
        db.commit()
    except IntegrityError:
        # 并发创建时唯一活跃索引拦截,回滚后返回已存在的任务
        db.rollback()
        existing = find_active_task(db, task_type, course_id, chapter_id)
        if existing:
            return existing, False
        raise
    db.refresh(task)
    return task, True


def claim_task(db: Session, task_id: str) -> bool:
    """原子领取任务:只有把状态从 pending/failed 改成 running 的那一个执行者能拿到。

    并发触发(客户端重试、多 worker、BackgroundTasks 重复派发)时,后来者的 UPDATE
    会匹配到 0 行并直接返回 False —— 这是"同一章节的 OCR 不会并行执行、
    不会写出重复字幕段"的关键保证。
    """
    claimed = (
        db.query(AiTask)
        .filter(AiTask.id == task_id, AiTask.status.in_(["pending", "failed"]))
        .update({"status": "running", "error": None, "updated_at": utc_now()}, synchronize_session=False)
    )
    db.commit()
    return bool(claimed)


def run_task_inline(
    db: Session,
    task: AiTask,
    count: int = 10,
    types: list[str] | None = None,
    user_id: str | None = None,
) -> AiTask:
    if not claim_task(db, task.id):
        # 已被其它执行者领取(或已执行完),不再重复执行
        db.refresh(task)
        return task
    db.refresh(task)
    try:
        if task.task_type == TASK_CHAPTER_SUMMARY:
            chapter = db.get(Chapter, task.chapter_id)
            if not chapter:
                raise ValueError("章节不存在")
            result_count = ai_pipeline.generate_chapter_summary(db, chapter)
        elif task.task_type == TASK_COURSE_SUMMARY:
            course = db.get(Course, task.course_id)
            if not course:
                raise ValueError("课程不存在")
            result_count = ai_pipeline.generate_course_summary(db, course)
        elif task.task_type == TASK_QUIZ:
            chapter = db.get(Chapter, task.chapter_id)
            if not chapter:
                raise ValueError("章节不存在")
            result_count = ai_pipeline.generate_quiz(db, chapter, count, types or ["choice", "truefalse"])
        elif task.task_type == TASK_FLASHCARDS:
            chapter = db.get(Chapter, task.chapter_id)
            if not chapter:
                raise ValueError("章节不存在")
            if not user_id:
                raise ValueError("缺少 user_id")
            result_count = ai_pipeline.generate_flashcards(db, chapter, count, user_id)
        elif task.task_type == TASK_EMAIL_DIGEST:
            organization = db.get(Organization, task.organization_id)
            if not organization:
                raise ValueError("组织不存在")
            send_digest(db, organization)
            result_count = 1
        elif task.task_type == TASK_CHAPTER_OCR:
            chapter = db.get(Chapter, task.chapter_id)
            if not chapter:
                raise ValueError("章节不存在")
            organization = db.get(Organization, task.organization_id)
            if not organization:
                raise ValueError("组织不存在")
            config = llm.llm_config_for_organization(organization)
            result_count = ai_ocr.ocr_chapter(db, chapter, organization, config)
        else:
            raise ValueError(f"未知任务类型: {task.task_type}")
    except Exception as exc:
        task.status = "failed"
        task.error = str(exc)[:2000]
    else:
        task.status = "done"
        task.result_count = result_count
    task.updated_at = utc_now()
    db.commit()
    db.refresh(task)
    return task


def _course_summary_ready(db: Session, course_id: str) -> bool:
    chapter_ids = [
        row[0]
        for row in db.query(TranscriptSegment.chapter_id).filter(TranscriptSegment.course_id == course_id).distinct().all()
    ]
    if not chapter_ids:
        return False
    summarized = (
        db.query(func.count(ChapterSummary.id))
        .filter(ChapterSummary.chapter_id.in_(chapter_ids), ChapterSummary.status == "done")
        .scalar()
    )
    return summarized == len(chapter_ids)


def run_ai_task(
    task_id: str,
    session_factory: Callable[[], Session] | None = None,
    count: int = 10,
    types: list[str] | None = None,
    user_id: str | None = None,
    chain_course_summary: bool = False,
) -> None:
    factory = session_factory or SessionLocal
    db = factory()
    try:
        task = db.get(AiTask, task_id)
        if not task:
            return
        run_task_inline(db, task, count=count, types=types, user_id=user_id)
        if chain_course_summary and task.task_type == TASK_CHAPTER_SUMMARY and task.status == "done":
            if _course_summary_ready(db, task.course_id):
                course_task, created = create_task(db, task.organization_id, TASK_COURSE_SUMMARY, task.course_id)
                if created:
                    run_task_inline(db, course_task)
    finally:
        db.close()


def maybe_auto_generate_chapter_summary(db: Session, background_tasks: BackgroundTasks, course: Course, chapter: Chapter) -> AiTask | None:
    organization = db.get(Organization, course.organization_id)
    if not organization or not organization.ai_auto_generate:
        return None
    if not (organization.llm_base_url and organization.llm_api_key and organization.llm_model):
        return None
    segment_count = db.query(func.count(TranscriptSegment.id)).filter(TranscriptSegment.chapter_id == chapter.id).scalar()
    if segment_count < AUTO_MIN_SEGMENTS:
        return None
    if db.query(ChapterSummary.id).filter(ChapterSummary.chapter_id == chapter.id).first():
        return None
    task, created = create_task(db, organization.id, TASK_CHAPTER_SUMMARY, course.id, chapter.id)
    if created:
        background_tasks.add_task(run_ai_task, task.id, chain_course_summary=True)
    return task
