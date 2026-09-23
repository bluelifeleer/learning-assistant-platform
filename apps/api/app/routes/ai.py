from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.deps import require_current_user
from app.db.session import get_db
from app.models.entities import AiTask, Chapter, ChapterSummary, Course, CourseSummary, QuizQuestion, TranscriptSegment, User
from app.schemas.ai import (
    AiSettingsOut,
    AiSettingsTestOut,
    AiSettingsUpdateIn,
    AiTaskCreatedOut,
    AiTaskOut,
    AskAnswerOut,
    AskRequestIn,
    ChapterSummaryOut,
    CourseSummaryOut,
    FlashcardsRequestIn,
    QuizQuestionListOut,
    QuizQuestionOut,
    QuizRequestIn,
)
from app.services import ai_qa, ai_tasks, llm
from app.services.plugins import ensure_default_organization

router = APIRouter(prefix="/ai", tags=["ai"])


def mask_api_key(api_key: str | None) -> str | None:
    if not api_key:
        return None
    if len(api_key) <= 8:
        return "****"
    return f"{api_key[:3]}****{api_key[-4:]}"


def settings_out(db: Session) -> AiSettingsOut:
    organization = ensure_default_organization(db)
    configured = bool(organization.llm_base_url and organization.llm_api_key and organization.llm_model)
    return AiSettingsOut(
        llm_base_url=organization.llm_base_url,
        llm_model=organization.llm_model,
        api_key_masked=mask_api_key(organization.llm_api_key),
        configured=configured,
        ai_auto_generate=bool(organization.ai_auto_generate),
    )


def task_out(task: AiTask) -> AiTaskOut:
    return AiTaskOut(
        id=task.id,
        task_type=task.task_type,
        course_id=task.course_id,
        chapter_id=task.chapter_id,
        status=task.status,
        result_count=task.result_count,
        error=task.error,
        created_at=task.created_at,
        updated_at=task.updated_at,
    )


def get_chapter_or_404(db: Session, chapter_id: str) -> Chapter:
    chapter = db.get(Chapter, chapter_id)
    if not chapter:
        raise HTTPException(status_code=404, detail="Chapter not found")
    return chapter


def get_course_or_404(db: Session, course_id: str) -> Course:
    course = db.get(Course, course_id)
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")
    return course


@router.get("/settings", response_model=AiSettingsOut)
def read_ai_settings(_: User = Depends(require_current_user), db: Session = Depends(get_db)) -> AiSettingsOut:
    return settings_out(db)


@router.put("/settings", response_model=AiSettingsOut)
def update_ai_settings(payload: AiSettingsUpdateIn, _: User = Depends(require_current_user), db: Session = Depends(get_db)) -> AiSettingsOut:
    organization = ensure_default_organization(db)
    if payload.llm_base_url is not None:
        organization.llm_base_url = payload.llm_base_url.rstrip("/") or None
    if payload.llm_model is not None:
        organization.llm_model = payload.llm_model or None
    if payload.llm_api_key is not None:
        organization.llm_api_key = payload.llm_api_key or None
    if payload.ai_auto_generate is not None:
        organization.ai_auto_generate = payload.ai_auto_generate
    db.commit()
    return settings_out(db)


@router.post("/settings/test", response_model=AiSettingsTestOut)
def test_ai_settings(_: User = Depends(require_current_user), db: Session = Depends(get_db)) -> AiSettingsTestOut:
    organization = ensure_default_organization(db)
    try:
        config = llm.llm_config_for_organization(organization)
    except llm.LLMNotConfiguredError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from None
    error = llm.test_connection(config)
    return AiSettingsTestOut(ok=error is None, detail=error)


@router.post("/summary/chapter/{chapter_id}", response_model=AiTaskCreatedOut)
def request_chapter_summary(
    chapter_id: str,
    background_tasks: BackgroundTasks,
    _: User = Depends(require_current_user),
    db: Session = Depends(get_db),
) -> AiTaskCreatedOut:
    chapter = get_chapter_or_404(db, chapter_id)
    course = get_course_or_404(db, chapter.course_id)
    task, created = ai_tasks.create_task(db, course.organization_id, ai_tasks.TASK_CHAPTER_SUMMARY, course.id, chapter.id)
    if created:
        background_tasks.add_task(ai_tasks.run_ai_task, task.id)
    return AiTaskCreatedOut(task_id=task.id, status=task.status)


@router.post("/summary/course/{course_id}", response_model=AiTaskCreatedOut)
def request_course_summary(
    course_id: str,
    background_tasks: BackgroundTasks,
    _: User = Depends(require_current_user),
    db: Session = Depends(get_db),
) -> AiTaskCreatedOut:
    course = get_course_or_404(db, course_id)
    task, created = ai_tasks.create_task(db, course.organization_id, ai_tasks.TASK_COURSE_SUMMARY, course.id)
    if created:
        background_tasks.add_task(ai_tasks.run_ai_task, task.id)
    return AiTaskCreatedOut(task_id=task.id, status=task.status)


@router.get("/summary/chapter/{chapter_id}", response_model=ChapterSummaryOut)
def read_chapter_summary(chapter_id: str, _: User = Depends(require_current_user), db: Session = Depends(get_db)) -> ChapterSummaryOut:
    summary = db.query(ChapterSummary).filter(ChapterSummary.chapter_id == chapter_id).first()
    if not summary:
        raise HTTPException(status_code=404, detail="Summary not found")
    return ChapterSummaryOut(
        chapter_id=summary.chapter_id,
        course_id=summary.course_id,
        summary_md=summary.summary_md,
        outline=summary.outline or [],
        key_points=summary.key_points or [],
        model=summary.model,
        status=summary.status,
        error=summary.error,
        updated_at=summary.updated_at,
    )


@router.get("/summary/course/{course_id}", response_model=CourseSummaryOut)
def read_course_summary(course_id: str, _: User = Depends(require_current_user), db: Session = Depends(get_db)) -> CourseSummaryOut:
    summary = db.query(CourseSummary).filter(CourseSummary.course_id == course_id).first()
    if not summary:
        raise HTTPException(status_code=404, detail="Summary not found")
    return CourseSummaryOut(
        course_id=summary.course_id,
        summary_md=summary.summary_md,
        outline=summary.outline or [],
        key_points=summary.key_points or [],
        model=summary.model,
        status=summary.status,
        error=summary.error,
        updated_at=summary.updated_at,
    )


@router.post("/quiz", response_model=AiTaskCreatedOut)
def request_quiz(
    payload: QuizRequestIn,
    background_tasks: BackgroundTasks,
    _: User = Depends(require_current_user),
    db: Session = Depends(get_db),
) -> AiTaskCreatedOut:
    chapter = get_chapter_or_404(db, payload.chapter_id)
    course = get_course_or_404(db, chapter.course_id)
    invalid_types = [item for item in payload.types if item not in ("choice", "truefalse")]
    if invalid_types or not payload.types:
        raise HTTPException(status_code=422, detail="types 只能包含 choice / truefalse")
    task, created = ai_tasks.create_task(db, course.organization_id, ai_tasks.TASK_QUIZ, course.id, chapter.id)
    if created:
        background_tasks.add_task(ai_tasks.run_ai_task, task.id, count=payload.count, types=payload.types)
    return AiTaskCreatedOut(task_id=task.id, status=task.status)


@router.get("/quiz", response_model=QuizQuestionListOut)
def list_quiz_questions(
    chapter_id: str | None = None,
    course_id: str | None = None,
    _: User = Depends(require_current_user),
    db: Session = Depends(get_db),
) -> QuizQuestionListOut:
    query = db.query(QuizQuestion)
    if chapter_id:
        query = query.filter(QuizQuestion.chapter_id == chapter_id)
    elif course_id:
        query = query.filter(QuizQuestion.course_id == course_id)
    else:
        raise HTTPException(status_code=422, detail="chapter_id 或 course_id 至少提供一个")
    questions = query.order_by(QuizQuestion.created_at.asc()).all()
    return QuizQuestionListOut(
        items=[
            QuizQuestionOut(
                id=question.id,
                course_id=question.course_id,
                chapter_id=question.chapter_id,
                question_type=question.question_type,
                question=question.question,
                options=question.options or [],
                answer=question.answer,
                explanation=question.explanation,
                model=question.model,
                created_at=question.created_at,
            )
            for question in questions
        ]
    )


@router.post("/flashcards", response_model=AiTaskCreatedOut)
def request_flashcards(
    payload: FlashcardsRequestIn,
    background_tasks: BackgroundTasks,
    user: User = Depends(require_current_user),
    db: Session = Depends(get_db),
) -> AiTaskCreatedOut:
    chapter = get_chapter_or_404(db, payload.chapter_id)
    course = get_course_or_404(db, chapter.course_id)
    task, created = ai_tasks.create_task(db, course.organization_id, ai_tasks.TASK_FLASHCARDS, course.id, chapter.id)
    if created:
        background_tasks.add_task(ai_tasks.run_ai_task, task.id, count=payload.count, user_id=user.id)
    return AiTaskCreatedOut(task_id=task.id, status=task.status)


@router.get("/tasks/{task_id}", response_model=AiTaskOut)
def read_task(task_id: str, _: User = Depends(require_current_user), db: Session = Depends(get_db)) -> AiTaskOut:
    task = db.get(AiTask, task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    return task_out(task)


@router.post("/ask", response_model=AskAnswerOut)
def ask_question(payload: AskRequestIn, _: User = Depends(require_current_user), db: Session = Depends(get_db)) -> AskAnswerOut:
    course = get_course_or_404(db, payload.course_id)
    if payload.chapter_id is not None:
        chapter = get_chapter_or_404(db, payload.chapter_id)
        if chapter.course_id != course.id:
            raise HTTPException(status_code=404, detail="Chapter not found")
    organization = ensure_default_organization(db)
    try:
        llm.llm_config_for_organization(organization)
    except llm.LLMNotConfiguredError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from None
    transcript_query = db.query(TranscriptSegment.id).filter(TranscriptSegment.course_id == course.id)
    if payload.chapter_id:
        transcript_query = transcript_query.filter(TranscriptSegment.chapter_id == payload.chapter_id)
    if transcript_query.first() is None:
        raise HTTPException(status_code=422, detail="该范围还没有任何字幕,请先在课程页播放并采集字幕")
    try:
        return ai_qa.answer_question(db, organization, payload)
    except llm.LLMRequestError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from None
