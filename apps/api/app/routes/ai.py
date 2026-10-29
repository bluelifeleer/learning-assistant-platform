from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.deps import require_current_user, require_owner
from app.db.session import get_db
from app.models.entities import (
    AiTask,
    Chapter,
    ChapterSummary,
    Course,
    CourseSummary,
    Organization,
    QuizQuestion,
    Screenshot,
    TranscriptSegment,
    User,
)
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
    QuizQuestionBulkDeleteIn,
    QuizQuestionDeleteOut,
    QuizQuestionListOut,
    QuizQuestionOut,
    QuizQuestionUpdateIn,
    QuizRequestIn,
    ScreenshotOcrOut,
)
from app.services import ai_ocr, ai_qa, ai_tasks, audit, llm
from app.services.plugins import ensure_default_organization
from app.services.tenancy import course_in_org, organization_for_user

router = APIRouter(prefix="/ai", tags=["ai"])

TRUEFALSE_OPTIONS = ("正确", "错误")


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
        llm_vision_model=organization.llm_vision_model,
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
def read_ai_settings(_: User = Depends(require_owner), db: Session = Depends(get_db)) -> AiSettingsOut:
    return settings_out(db)


@router.put("/settings", response_model=AiSettingsOut)
def update_ai_settings(payload: AiSettingsUpdateIn, _: User = Depends(require_owner), db: Session = Depends(get_db)) -> AiSettingsOut:
    organization = ensure_default_organization(db)
    if payload.llm_base_url is not None:
        organization.llm_base_url = payload.llm_base_url.rstrip("/") or None
    if payload.llm_model is not None:
        organization.llm_model = payload.llm_model or None
    if payload.llm_vision_model is not None:
        organization.llm_vision_model = payload.llm_vision_model or None
    if payload.llm_api_key is not None:
        organization.llm_api_key = payload.llm_api_key or None
    if payload.ai_auto_generate is not None:
        organization.ai_auto_generate = payload.ai_auto_generate
    db.commit()
    return settings_out(db)


@router.post("/settings/test", response_model=AiSettingsTestOut)
def test_ai_settings(_: User = Depends(require_owner), db: Session = Depends(get_db)) -> AiSettingsTestOut:
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
    user: User = Depends(require_current_user),
    db: Session = Depends(get_db),
) -> QuizQuestionListOut:
    organization = organization_for_user(db, user)
    query = db.query(QuizQuestion)
    if chapter_id:
        chapter = get_chapter_or_404(db, chapter_id)
        _require_course_in_org(db, chapter.course_id, organization)
        query = query.filter(QuizQuestion.chapter_id == chapter_id)
    elif course_id:
        _require_course_in_org(db, course_id, organization)
        query = query.filter(QuizQuestion.course_id == course_id)
    else:
        raise HTTPException(status_code=422, detail="chapter_id 或 course_id 至少提供一个")
    questions = query.order_by(QuizQuestion.created_at.asc()).all()
    return QuizQuestionListOut(items=[_question_out(question) for question in questions])


def _require_course_in_org(db: Session, course_id: str, organization: Organization) -> Course:
    course = course_in_org(db, course_id, organization)
    if course is None:
        raise HTTPException(status_code=404, detail="Course not found")
    return course


def _question_or_404(db: Session, question_id: str, user: User) -> QuizQuestion:
    question = db.get(QuizQuestion, question_id)
    if question is None:
        raise HTTPException(status_code=404, detail="Question not found")
    organization = organization_for_user(db, user)
    if course_in_org(db, question.course_id, organization) is None:
        raise HTTPException(status_code=404, detail="Question not found")
    return question


def _question_out(question: QuizQuestion) -> QuizQuestionOut:
    return QuizQuestionOut(
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


@router.patch("/quiz/{question_id}", response_model=QuizQuestionOut)
def update_quiz_question(
    question_id: str,
    payload: QuizQuestionUpdateIn,
    user: User = Depends(require_current_user),
    db: Session = Depends(get_db),
) -> QuizQuestionOut:
    question = _question_or_404(db, question_id, user)
    if payload.question is not None:
        text = payload.question.strip()
        if not text:
            raise HTTPException(status_code=422, detail="题目内容不能为空")
        question.question = text
    if payload.options is not None:
        options = [option.strip() for option in payload.options if option.strip()]
        question.options = options
    if payload.answer is not None:
        question.answer = payload.answer.strip()
    if payload.explanation is not None:
        question.explanation = payload.explanation.strip() or None
    if payload.question_type is not None:
        question.question_type = payload.question_type

    question.question_type = _normalize_question_type_and_answer(question)
    audit.record(
        db,
        audit.QUIZ_QUESTION_UPDATED,
        resource_type="quiz_question",
        resource_id=question.id,
        user_id=user.id,
        organization_id=organization_for_user(db, user).id,
        payload={"fields": sorted(payload.model_fields_set)},
    )
    db.commit()
    db.refresh(question)
    return _question_out(question)


def _normalize_question_type_and_answer(question: QuizQuestion) -> str:
    """判断题固定两个选项；选择题的答案必须落在选项里，否则拒绝。"""
    if question.question_type == "truefalse":
        question.options = list(TRUEFALSE_OPTIONS)
        if question.answer not in TRUEFALSE_OPTIONS:
            raise HTTPException(status_code=422, detail="判断题答案只能是「正确」或「错误」")
        return "truefalse"
    if not question.options:
        raise HTTPException(status_code=422, detail="选择题至少要有一个选项")
    if question.answer not in question.options:
        raise HTTPException(status_code=422, detail="答案必须是选项之一")
    return "choice" if question.question_type not in ("choice", "truefalse") else question.question_type


@router.delete("/quiz/{question_id}", response_model=QuizQuestionDeleteOut)
def delete_quiz_question(
    question_id: str,
    user: User = Depends(require_current_user),
    db: Session = Depends(get_db),
) -> QuizQuestionDeleteOut:
    question = _question_or_404(db, question_id, user)
    organization_id = question.course_id and organization_for_user(db, user).id
    db.delete(question)
    audit.record(
        db,
        audit.QUIZ_QUESTION_DELETED,
        resource_type="quiz_question",
        resource_id=question_id,
        user_id=user.id,
        organization_id=organization_id,
        payload={"question": question.question[:200]},
    )
    db.commit()
    return QuizQuestionDeleteOut(deleted=1)


@router.post("/quiz/bulk-delete", response_model=QuizQuestionDeleteOut)
def bulk_delete_quiz_questions(
    payload: QuizQuestionBulkDeleteIn,
    user: User = Depends(require_current_user),
    db: Session = Depends(get_db),
) -> QuizQuestionDeleteOut:
    organization = organization_for_user(db, user)
    deleted = 0
    for question_id in payload.ids:
        question = db.get(QuizQuestion, question_id)
        if question is None:
            continue
        if course_in_org(db, question.course_id, organization) is None:
            continue
        db.delete(question)
        deleted += 1
    audit.record(
        db,
        audit.QUIZ_QUESTION_DELETED,
        resource_type="quiz_question",
        resource_id="bulk",
        user_id=user.id,
        organization_id=organization.id,
        payload={"deleted": deleted, "requested": len(payload.ids)},
    )
    db.commit()
    return QuizQuestionDeleteOut(deleted=deleted)


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


@router.post("/ocr/chapter/{chapter_id}", response_model=AiTaskCreatedOut)
def request_chapter_ocr(
    chapter_id: str,
    background_tasks: BackgroundTasks,
    _: User = Depends(require_current_user),
    db: Session = Depends(get_db),
) -> AiTaskCreatedOut:
    chapter = get_chapter_or_404(db, chapter_id)
    course = get_course_or_404(db, chapter.course_id)
    organization = ensure_default_organization(db)
    try:
        llm.llm_config_for_organization(organization)
    except llm.LLMNotConfiguredError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from None
    has_screenshot = db.query(Screenshot.id).filter(Screenshot.chapter_id == chapter.id).first()
    if not has_screenshot:
        raise HTTPException(status_code=422, detail="该章节没有截图,请先在学习页截图")
    task, created = ai_tasks.create_task(db, course.organization_id, ai_tasks.TASK_CHAPTER_OCR, course.id, chapter.id)
    if created:
        background_tasks.add_task(ai_tasks.run_ai_task, task.id)
    return AiTaskCreatedOut(task_id=task.id, status=task.status)


@router.post("/ocr/screenshot/{screenshot_id}", response_model=ScreenshotOcrOut)
def request_screenshot_ocr(
    screenshot_id: str,
    _: User = Depends(require_current_user),
    db: Session = Depends(get_db),
) -> ScreenshotOcrOut:
    # 单张识别足够快,同步返回
    screenshot = db.get(Screenshot, screenshot_id)
    if not screenshot:
        raise HTTPException(status_code=404, detail="Screenshot not found")
    organization = ensure_default_organization(db)
    try:
        config = llm.llm_config_for_organization(organization)
    except llm.LLMNotConfiguredError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from None
    cached = bool(screenshot.ocr_text)
    try:
        text = ai_ocr.ocr_screenshot(db, screenshot, config, organization.llm_vision_model or None)
    except llm.LLMRequestError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from None
    return ScreenshotOcrOut(ok=True, ocr_text=text, cached=cached)
