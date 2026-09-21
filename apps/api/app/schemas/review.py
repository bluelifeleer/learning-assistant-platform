from datetime import datetime

from pydantic import BaseModel, Field


class ReviewCardCreateIn(BaseModel):
    note_id: str = Field(min_length=1)


class ReviewAnswerIn(BaseModel):
    result: str = Field(pattern="^(good|again)$")


class ReviewCardOut(BaseModel):
    id: str
    note_id: str | None = None
    course_id: str
    chapter_id: str | None = None
    user_id: str
    front: str
    back: str
    ease_factor: float
    interval_days: int
    due_at: datetime | None = None
    review_count: int
    created_at: datetime | None = None


class ReviewCardListOut(BaseModel):
    items: list[ReviewCardOut]
