from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


class AiSettingsOut(BaseModel):
    llm_base_url: str | None = None
    llm_model: str | None = None
    llm_vision_model: str | None = None
    api_key_masked: str | None = None
    configured: bool
    ai_auto_generate: bool


class AiSettingsUpdateIn(BaseModel):
    llm_base_url: str | None = None
    llm_api_key: str | None = None
    llm_model: str | None = None
    llm_vision_model: str | None = None
    ai_auto_generate: bool | None = None


class AiSettingsTestOut(BaseModel):
    ok: bool
    detail: str | None = None


class AiTaskCreatedOut(BaseModel):
    task_id: str
    status: str


class AiTaskOut(BaseModel):
    id: str
    task_type: str
    course_id: str | None = None
    chapter_id: str | None = None
    status: str
    result_count: int
    error: str | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None


class ChapterSummaryOut(BaseModel):
    chapter_id: str
    course_id: str
    summary_md: str
    outline: list = []
    key_points: list = []
    model: str
    status: str
    error: str | None = None
    updated_at: datetime | None = None


class CourseSummaryOut(BaseModel):
    course_id: str
    summary_md: str
    outline: list = []
    key_points: list = []
    model: str
    status: str
    error: str | None = None
    updated_at: datetime | None = None


class QuizRequestIn(BaseModel):
    chapter_id: str = Field(min_length=1)
    count: int = Field(default=10, ge=1, le=50)
    types: list[str] = ["choice", "truefalse"]


class QuizQuestionOut(BaseModel):
    id: str
    course_id: str
    chapter_id: str
    question_type: str
    question: str
    options: list = []
    answer: str
    explanation: str | None = None
    model: str
    created_at: datetime | None = None


class QuizQuestionListOut(BaseModel):
    items: list[QuizQuestionOut]


class QuizQuestionUpdateIn(BaseModel):
    """只传需要改的字段；选择题的 answer 必须落在 options 里，判断题固定正确/错误。"""

    question: str | None = Field(default=None, max_length=2000)
    options: list[str] | None = Field(default=None, max_length=10)
    answer: str | None = Field(default=None, max_length=500)
    explanation: str | None = Field(default=None, max_length=2000)
    question_type: Literal["choice", "truefalse"] | None = None


class QuizQuestionBulkDeleteIn(BaseModel):
    ids: list[str] = Field(min_length=1, max_length=500)


class QuizQuestionDeleteOut(BaseModel):
    deleted: int


class FlashcardsRequestIn(BaseModel):
    chapter_id: str = Field(min_length=1)
    count: int = Field(default=10, ge=1, le=50)


class ScreenshotOcrOut(BaseModel):
    ok: bool
    ocr_text: str
    cached: bool = False


class AskHistoryMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=2000)


class AskRequestIn(BaseModel):
    course_id: str = Field(min_length=1)
    chapter_id: str | None = None
    question: str = Field(min_length=1, max_length=2000)
    history: list[AskHistoryMessage] = []


class AskCitation(BaseModel):
    chapter_id: str
    chapter_title: str
    start_seconds: float | None = None
    excerpt: str


class AskAnswerOut(BaseModel):
    answer_md: str
    citations: list[AskCitation] = []
