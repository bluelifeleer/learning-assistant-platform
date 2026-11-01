from datetime import UTC, datetime, timedelta

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.models.entities import Course, Note, ReviewCard, ReviewLog, TranscriptSegment

MIN_EASE_FACTOR = 1.3
AGAIN_EASE_PENALTY = 0.2
VALID_RESULTS = {"good", "again"}
CONTEXT_WINDOW_SECONDS = 10


def utc_now() -> datetime:
    return datetime.now(UTC)


def review_back_for_note(db: Session, note: Note) -> str:
    """取笔记时间点前后 10 秒的字幕,作为复习卡背面。"""
    if not note.chapter_id or note.video_time_seconds is None:
        return ""
    center = float(note.video_time_seconds)
    segments = (
        db.query(TranscriptSegment)
        .filter(
            TranscriptSegment.chapter_id == note.chapter_id,
            TranscriptSegment.start_seconds.isnot(None),
            TranscriptSegment.start_seconds >= center - CONTEXT_WINDOW_SECONDS,
            TranscriptSegment.start_seconds <= center + CONTEXT_WINDOW_SECONDS,
        )
        .order_by(TranscriptSegment.start_seconds.asc())
        .all()
    )
    return "\n".join(segment.text for segment in segments)


def build_review_card(db: Session, note: Note, user_id: str) -> ReviewCard:
    """从笔记建一张到期复习卡;前端和插件采集共用同一套 front/back 规则。"""
    course = db.query(Course).filter(Course.id == note.course_id).first()
    if not course:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Course not found")
    card = ReviewCard(
        organization_id=course.organization_id,
        note_id=note.id,
        course_id=note.course_id,
        chapter_id=note.chapter_id,
        user_id=user_id,
        front=note.corrected_content or note.content,
        back=review_back_for_note(db, note),
        due_at=utc_now(),
    )
    db.add(card)
    db.commit()
    db.refresh(card)
    return card


class ReviewService:
    def __init__(self, db: Session):
        self.db = db

    def answer(self, card: ReviewCard, result: str) -> ReviewCard:
        if result not in VALID_RESULTS:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="result must be 'good' or 'again'")
        if result == "good":
            card.interval_days = 1 if card.interval_days <= 0 else max(1, round(card.interval_days * card.ease_factor))
        else:
            card.interval_days = 0
            card.ease_factor = max(MIN_EASE_FACTOR, card.ease_factor - AGAIN_EASE_PENALTY)
        card.due_at = utc_now() + timedelta(days=card.interval_days)
        card.review_count = (card.review_count or 0) + 1
        self.db.add(ReviewLog(card_id=card.id, result=result))
        self.db.commit()
        self.db.refresh(card)
        return card
