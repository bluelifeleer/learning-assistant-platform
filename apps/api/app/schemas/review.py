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
    suspended: bool = False
    created_at: datetime | None = None


class ReviewCardListOut(BaseModel):
    items: list[ReviewCardOut]


class ReviewCardUpdateIn(BaseModel):
    """卡片管理:暂停 / 恢复(/ 手动改到期时间)。"""

    suspended: bool | None = None
    due_at: datetime | None = None


class ReviewCardDeleteOut(BaseModel):
    affected: int
