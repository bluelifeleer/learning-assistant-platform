from datetime import UTC, datetime, timedelta

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.models.entities import ReviewCard, ReviewLog

MIN_EASE_FACTOR = 1.3
AGAIN_EASE_PENALTY = 0.2
VALID_RESULTS = {"good", "again"}


def utc_now() -> datetime:
    return datetime.now(UTC).replace(tzinfo=None)


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
