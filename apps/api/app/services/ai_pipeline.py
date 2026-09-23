from sqlalchemy.orm import Session

from app.models.entities import Chapter, ChapterSummary, Course, CourseSummary, Organization, QuizQuestion, ReviewCard, TranscriptSegment
from app.services import ai_prompts, llm
from app.services.review import utc_now

CHUNK_SIZE = 6000
CHUNK_OVERLAP = 200
TRUEFALSE_OPTIONS = ["正确", "错误"]


def format_mmss(seconds: float | None) -> str:
    total = int(seconds or 0)
    return f"{total // 60:02d}:{total % 60:02d}"


def assemble_transcript(db: Session, chapter_id: str) -> str:
    segments = (
        db.query(TranscriptSegment)
        .filter(TranscriptSegment.chapter_id == chapter_id)
        .order_by(TranscriptSegment.start_seconds.asc())
        .all()
    )
    lines = []
    for segment in segments:
        if segment.start_seconds is not None:
            lines.append(f"[{format_mmss(segment.start_seconds)}] {segment.text}")
        else:
            lines.append(segment.text)
    return "\n".join(lines)


def chunk_text(text: str, size: int = CHUNK_SIZE, overlap: int = CHUNK_OVERLAP) -> list[str]:
    if len(text) <= size:
        return [text]
    chunks = []
    start = 0
    while start < len(text):
        chunks.append(text[start : start + size])
        start += size - overlap
    return chunks


def _organization_for_course(db: Session, course: Course) -> Organization:
    organization = db.get(Organization, course.organization_id)
    if not organization:
        raise llm.LLMNotConfiguredError()
    return organization


def _transcript_for_llm(db: Session, chapter: Chapter) -> str:
    transcript = assemble_transcript(db, chapter.id)
    if not transcript.strip():
        raise ValueError("该章节没有字幕,无法生成")
    return transcript


def _summary_payload(db: Session, chapter: Chapter) -> dict:
    transcript = _transcript_for_llm(db, chapter)
    organization = _organization_for_course(db, chapter.course)
    config = llm.llm_config_for_organization(organization)
    chunks = chunk_text(transcript)
    if len(chunks) == 1:
        payload = llm.chat_completion_json(config, ai_prompts.chapter_summary_messages(chapter.title, transcript))
    else:
        points: list[str] = []
        for index, chunk in enumerate(chunks, start=1):
            partial = llm.chat_completion_json(config, ai_prompts.chunk_key_points_messages(chapter.title, chunk, index, len(chunks)))
            if isinstance(partial, dict) and isinstance(partial.get("key_points"), list):
                points.extend(str(point) for point in partial["key_points"] if point)
        payload = llm.chat_completion_json(
            config, ai_prompts.chapter_summary_from_points_messages(chapter.title, "\n".join(f"- {point}" for point in points))
        )
    if not isinstance(payload, dict) or not payload.get("summary_md"):
        raise llm.LLMRequestError("LLM 返回的摘要格式不正确")
    return {
        "summary_md": str(payload["summary_md"]),
        "outline": payload.get("outline") if isinstance(payload.get("outline"), list) else [],
        "key_points": [str(point) for point in payload.get("key_points") or [] if point],
        "model": config.model,
    }


def generate_chapter_summary(db: Session, chapter: Chapter) -> int:
    data = _summary_payload(db, chapter)
    summary = db.query(ChapterSummary).filter(ChapterSummary.chapter_id == chapter.id).first()
    if not summary:
        summary = ChapterSummary(chapter_id=chapter.id, course_id=chapter.course_id)
        db.add(summary)
    summary.summary_md = data["summary_md"]
    summary.outline = data["outline"]
    summary.key_points = data["key_points"]
    summary.model = data["model"]
    summary.status = "done"
    summary.error = None
    summary.updated_at = utc_now()
    db.commit()
    return 1


def generate_course_summary(db: Session, course: Course) -> int:
    organization = _organization_for_course(db, course)
    config = llm.llm_config_for_organization(organization)
    chapters = db.query(Chapter).filter(Chapter.course_id == course.id).order_by(Chapter.sort_order.asc()).all()
    summarized: list[str] = []
    skipped: list[str] = []
    for chapter in chapters:
        summary = db.query(ChapterSummary).filter(ChapterSummary.chapter_id == chapter.id).first()
        if summary and summary.status == "done":
            summarized.append(f"## {chapter.title}\n{summary.summary_md}")
        else:
            skipped.append(chapter.title)
    if not summarized:
        raise ValueError("该课程还没有任何章节摘要,请先生成章节摘要")
    payload = llm.chat_completion_json(
        config, ai_prompts.course_summary_messages(course.title, "\n\n".join(summarized), skipped)
    )
    if not isinstance(payload, dict) or not payload.get("summary_md"):
        raise llm.LLMRequestError("LLM 返回的课程摘要格式不正确")
    summary_md = str(payload["summary_md"])
    if skipped:
        summary_md += "\n\n> 未参与聚合的章节(暂无摘要):" + "、".join(skipped)
    summary = db.query(CourseSummary).filter(CourseSummary.course_id == course.id).first()
    if not summary:
        summary = CourseSummary(course_id=course.id)
        db.add(summary)
    summary.summary_md = summary_md
    summary.outline = payload.get("outline") if isinstance(payload.get("outline"), list) else []
    summary.key_points = [str(point) for point in payload.get("key_points") or [] if point]
    summary.model = config.model
    summary.status = "done"
    summary.error = None
    summary.updated_at = utc_now()
    db.commit()
    return 1


def _normalize_quiz_item(item: object) -> dict | None:
    if not isinstance(item, dict):
        return None
    question_type = str(item.get("question_type") or "").strip()
    question = str(item.get("question") or "").strip()
    answer = str(item.get("answer") or "").strip()
    explanation = str(item.get("explanation") or "").strip() or None
    options = item.get("options")
    if not question or not answer:
        return None
    if question_type == "choice":
        if not isinstance(options, list) or len(options) != 4:
            return None
        options = [str(option) for option in options]
        if answer not in options:
            return None
    elif question_type == "truefalse":
        options = list(TRUEFALSE_OPTIONS)
        if answer not in options:
            return None
    else:
        return None
    return {"question_type": question_type, "question": question, "options": options, "answer": answer, "explanation": explanation}


def generate_quiz(db: Session, chapter: Chapter, count: int, types: list[str]) -> int:
    transcript = _transcript_for_llm(db, chapter)
    organization = _organization_for_course(db, chapter.course)
    config = llm.llm_config_for_organization(organization)
    payload = llm.chat_completion_json(config, ai_prompts.quiz_messages(chapter.title, transcript, count, types))
    items = payload if isinstance(payload, list) else []
    inserted = 0
    for raw in items:
        item = _normalize_quiz_item(raw)
        if not item:
            continue
        db.add(
            QuizQuestion(
                course_id=chapter.course_id,
                chapter_id=chapter.id,
                question_type=item["question_type"],
                question=item["question"],
                options=item["options"],
                answer=item["answer"],
                explanation=item["explanation"],
                model=config.model,
            )
        )
        inserted += 1
    db.commit()
    if inserted == 0:
        raise llm.LLMRequestError("LLM 返回的题目全部未通过校验")
    return inserted


def generate_flashcards(db: Session, chapter: Chapter, count: int, user_id: str) -> int:
    transcript = _transcript_for_llm(db, chapter)
    organization = _organization_for_course(db, chapter.course)
    config = llm.llm_config_for_organization(organization)
    payload = llm.chat_completion_json(config, ai_prompts.flashcards_messages(chapter.title, transcript, count))
    items = payload if isinstance(payload, list) else []
    inserted = 0
    for raw in items:
        if not isinstance(raw, dict):
            continue
        front = str(raw.get("front") or "").strip()
        back = str(raw.get("back") or "").strip()
        if not front or not back:
            continue
        if not front.startswith("[AI]"):
            front = f"[AI] {front}"
        db.add(
            ReviewCard(
                organization_id=organization.id,
                note_id=None,
                course_id=chapter.course_id,
                chapter_id=chapter.id,
                user_id=user_id,
                front=front,
                back=back,
                due_at=utc_now(),
            )
        )
        inserted += 1
    db.commit()
    if inserted == 0:
        raise llm.LLMRequestError("LLM 没有返回可用的闪卡")
    return inserted
