import base64
from pathlib import Path

from sqlalchemy.orm import Session

from app.models.entities import Chapter, Organization, Screenshot, TranscriptSegment
from app.services import llm

OCR_SOURCE = "ocr"
OCR_TIME_TOLERANCE_SECONDS = 0.5


def _vision_model(organization: Organization) -> str | None:
    return organization.llm_vision_model or None


def _ocr_file(config: llm.LLMConfig, file_path: str, vision_model: str | None) -> str:
    data = Path(file_path).read_bytes()
    image_b64 = base64.b64encode(data).decode("ascii")
    from app.services.ai_prompts import OCR_PROMPT

    return llm.chat_completion_vision(config, OCR_PROMPT, [image_b64], model_override=vision_model).strip()


def ocr_screenshot(db: Session, screenshot: Screenshot, config: llm.LLMConfig, vision_model: str | None = None) -> str:
    """单张截图识别,结果写回 ocr_text 并复用缓存"""
    if screenshot.ocr_text:
        return screenshot.ocr_text
    text = _ocr_file(config, screenshot.file_path, vision_model)
    screenshot.ocr_text = text
    db.commit()
    db.refresh(screenshot)
    return text


def _has_ocr_segment(db: Session, screenshot: Screenshot, text: str) -> bool:
    query = db.query(TranscriptSegment.id).filter(
        TranscriptSegment.chapter_id == screenshot.chapter_id,
        TranscriptSegment.source == OCR_SOURCE,
    )
    if screenshot.video_time_seconds is None:
        # 无时间点的截图按识别文本去重(ocr_text 已缓存,文本跨次运行稳定)
        query = query.filter(TranscriptSegment.start_seconds.is_(None), TranscriptSegment.text == text)
    else:
        center = float(screenshot.video_time_seconds)
        query = query.filter(
            TranscriptSegment.start_seconds >= center - OCR_TIME_TOLERANCE_SECONDS,
            TranscriptSegment.start_seconds <= center + OCR_TIME_TOLERANCE_SECONDS,
        )
    return query.first() is not None


def ocr_chapter(db: Session, chapter: Chapter, organization: Organization, config: llm.LLMConfig) -> int:
    """把章节全部截图 OCR 成字幕段(source="ocr"),让无字幕章节复用摘要/出题/问答管线

    幂等:已有 ocr_text 的截图直接复用;时间点(±0.5s)已有 OCR 段的跳过,
    无时间点的按识别文本跳过。

    并发安全:同一章节不会并行跑两次 —— 任务层用原子领取
    (ai_tasks.claim_task + uq_ai_task_active 部分唯一索引)保证只有一个执行者,
    因此这里的"先查后插"不存在跨运行的竞态。
    本次运行内用 queued_starts / queued_texts 显式去重,不依赖 session 的
    autoflush 行为(isolation 更清晰,也不会因为 flush 时机变化而退化)。
    返回新增字幕段数。
    """
    screenshots = (
        db.query(Screenshot)
        .filter(Screenshot.chapter_id == chapter.id)
        .order_by(Screenshot.video_time_seconds.asc())
        .all()
    )
    created = 0
    vision_model = _vision_model(organization)
    queued_starts: list[float] = []
    queued_texts: set[str] = set()
    for screenshot in screenshots:
        text = ocr_screenshot(db, screenshot, config, vision_model)
        if not text:
            continue
        center = None if screenshot.video_time_seconds is None else float(screenshot.video_time_seconds)
        # 本次运行内已入队(尚未提交)的段
        if center is None:
            if text in queued_texts:
                continue
        elif any(abs(center - start) <= OCR_TIME_TOLERANCE_SECONDS for start in queued_starts):
            continue
        # 上一次运行已落库的段
        if _has_ocr_segment(db, screenshot, text):
            continue
        db.add(
            TranscriptSegment(
                course_id=screenshot.course_id,
                chapter_id=chapter.id,
                video_session_id=None,
                start_seconds=screenshot.video_time_seconds,
                end_seconds=None,
                text=text,
                source=OCR_SOURCE,
            )
        )
        if center is None:
            queued_texts.add(text)
        else:
            queued_starts.append(center)
        created += 1
    db.commit()
    return created
