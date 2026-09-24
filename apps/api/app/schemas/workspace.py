from datetime import datetime

from pydantic import BaseModel, Field


class CourseListItem(BaseModel):
    id: str
    title: str
    term: str | None = None
    site_name: str
    adapter_id: str
    chapter_count: int
    transcript_count: int
    note_count: int
    updated_at: datetime | None = None


class CourseListOut(BaseModel):
    items: list[CourseListItem]


class ChapterOut(BaseModel):
    id: str
    parent_id: str | None = None
    title: str
    sort_order: int


class CourseDetailOut(BaseModel):
    id: str
    title: str
    term: str | None = None
    chapters: list[ChapterOut]


class ChapterTranscriptOut(BaseModel):
    id: str
    start_seconds: float | None = None
    end_seconds: float | None = None
    text: str
    source: str


class ChapterNoteOut(BaseModel):
    id: str
    user_id: str
    video_time_seconds: float | None = None
    content: str
    corrected_content: str | None = None
    tags: list[str] = []
    created_at: datetime | None = None


class ChapterFlagsOut(BaseModel):
    has_transcript: bool = False
    has_notes: bool = False
    has_summary: bool = False
    has_quiz: bool = False
    studied: bool = False


class ChapterDetailOut(BaseModel):
    id: str
    parent_id: str | None = None
    external_chapter_id: str
    title: str
    sort_order: int
    duration_seconds: int | None = None
    transcripts: list[ChapterTranscriptOut] = Field(default_factory=list)
    notes: list[ChapterNoteOut] = Field(default_factory=list)
    flags: ChapterFlagsOut = Field(default_factory=ChapterFlagsOut)
    children: list["ChapterDetailOut"] = Field(default_factory=list)


class CourseFullDetailOut(BaseModel):
    id: str
    title: str
    term: str | None = None
    external_course_id: str
    chapters: list[ChapterDetailOut]


class TranscriptItem(BaseModel):
    id: str
    course_id: str
    course_title: str
    chapter_id: str
    chapter_title: str
    start_seconds: float | None = None
    end_seconds: float | None = None
    text: str
    source: str
    created_at: datetime | None = None


class TranscriptListOut(BaseModel):
    items: list[TranscriptItem]


class VideoEventItem(BaseModel):
    id: str
    session_id: str
    event_type: str
    video_time_seconds: float | None = None
    course_url: str | None = None
    external_course_id: str | None = None
    external_chapter_id: str | None = None
    video_source: dict
    payload: dict
    created_at: datetime | None = None


class VideoEventListOut(BaseModel):
    items: list[VideoEventItem]


class VideoSourceOut(BaseModel):
    current_src: str | None = None
    source_urls: list[str] = []
    poster_url: str | None = None
    is_blob: bool = False
    is_likely_signed: bool = False
    media_type: str = "unknown"


class ChapterVideoSourceOut(BaseModel):
    chapter_id: str | None = None
    chapter_title: str | None = None
    course_url: str | None = None
    video_source: VideoSourceOut
    captured_at: datetime | None = None


class CourseVideoSourcesOut(BaseModel):
    items: list[ChapterVideoSourceOut]


class NoteCreateIn(BaseModel):
    course_id: str
    chapter_id: str | None = None
    video_time_seconds: float | None = None
    content: str = Field(min_length=1)
    tags: list[str] = Field(default_factory=list)


class NoteItem(BaseModel):
    id: str
    course_id: str
    course_title: str
    chapter_id: str | None = None
    chapter_title: str | None = None
    video_time_seconds: float | None = None
    content: str
    corrected_content: str | None = None
    tags: list[str] = []
    created_at: datetime | None = None


class NoteCorrectionIn(BaseModel):
    corrected_content: str | None = None


class NoteTagsIn(BaseModel):
    tags: list[str] = Field(default_factory=list)


class ScreenshotImageUpdateIn(BaseModel):
    image_base64: str = Field(min_length=1)


class CourseCreateIn(BaseModel):
    title: str = Field(min_length=1, max_length=500)
    term: str | None = None


class NoteListOut(BaseModel):
    items: list[NoteItem]


class SearchOut(BaseModel):
    notes: list[NoteItem]
    transcripts: list[TranscriptItem]


class StatsDailyItem(BaseModel):
    date: str
    notes: int
    play_events: int


class StatsSummaryOut(BaseModel):
    courses: int
    notes: int
    transcripts: int
    play_events: int
    daily: list[StatsDailyItem]


class AdapterItem(BaseModel):
    id: str
    adapter_id: str
    name: str
    status: str
    host_patterns: dict


class AdapterListOut(BaseModel):
    items: list[AdapterItem]


class AdapterSaveIn(BaseModel):
    adapter_id: str = Field(min_length=1, max_length=120)
    name: str = Field(min_length=1, max_length=200)
    status: str = Field(default="enabled", min_length=1, max_length=50)
    host_patterns: dict = Field(default_factory=dict)


class AdapterUpdateIn(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    status: str | None = Field(default=None, min_length=1, max_length=50)
    host_patterns: dict | None = None


class WorkspaceSettingsOut(BaseModel):
    organization_name: str
    plan: str
    license_key: str | None = None
    license_status: str
    api_base_url: str
    database_type: str | None = None
    export_dir: str
    weekly_goal_minutes: int = 300


class WorkspaceSettingsUpdateIn(BaseModel):
    organization_name: str | None = Field(default=None, min_length=1, max_length=200)
    license_key: str | None = Field(default=None, max_length=200)
    weekly_goal_minutes: int | None = Field(default=None, ge=10, le=10080)


class ExportCreateIn(BaseModel):
    course_id: str | None = None
    export_format: str = "markdown"


class ExportItem(BaseModel):
    id: str
    course_id: str | None = None
    course_title: str | None = None
    format: str
    status: str
    file_path: str | None = None
    created_at: datetime | None = None


class ExportListOut(BaseModel):
    items: list[ExportItem]


class ScreenshotItem(BaseModel):
    id: str
    course_id: str
    course_title: str | None = None
    chapter_id: str | None = None
    chapter_title: str | None = None
    video_time_seconds: float | None = None
    ocr_text: str | None = None
    created_at: datetime | None = None


class ScreenshotListOut(BaseModel):
    items: list[ScreenshotItem]


class NoteImageUploadIn(BaseModel):
    image_base64: str = Field(min_length=1)


class NoteImageUploadOut(BaseModel):
    id: str


class QuizAttemptItemIn(BaseModel):
    question_id: str = Field(min_length=1)
    chosen: str = Field(default="")
    correct: bool = False


class QuizAttemptsIn(BaseModel):
    items: list[QuizAttemptItemIn] = Field(min_length=1, max_length=100)


class QuizAttemptsOut(BaseModel):
    recorded: int


class MasteryItem(BaseModel):
    course_id: str
    course_title: str | None = None
    chapter_id: str
    chapter_title: str | None = None
    total: int
    correct: int
    accuracy: float
    last_attempt_at: datetime | None = None


class MasteryOut(BaseModel):
    items: list[MasteryItem]


class CourseProgressItem(BaseModel):
    course_id: str
    course_title: str
    total_chapters: int
    studied_chapters: int
    progress_pct: float


class ContinueLearningItem(BaseModel):
    course_id: str
    course_title: str
    chapter_id: str
    chapter_title: str


class LearningProgressOut(BaseModel):
    streak_days: int
    week_minutes: int
    weekly_goal_minutes: int
    continue_learning: ContinueLearningItem | None = None
    courses: list[CourseProgressItem]


class EmailSettingsOut(BaseModel):
    smtp_host: str | None = None
    smtp_port: int
    smtp_username: str | None = None
    password_masked: str | None = None
    email_from: str | None = None
    email_to: str | None = None
    configured: bool
    digest_auto: bool
    digest_frequency: str
    digest_hour: int
    last_digest_at: datetime | None = None


class EmailSettingsUpdateIn(BaseModel):
    smtp_host: str | None = Field(default=None, max_length=200)
    smtp_port: int | None = Field(default=None, ge=1, le=65535)
    smtp_username: str | None = Field(default=None, max_length=200)
    smtp_password: str | None = Field(default=None, max_length=500)
    email_from: str | None = Field(default=None, max_length=320)
    email_to: str | None = Field(default=None, max_length=320)
    digest_auto: bool | None = None
    digest_frequency: str | None = None
    digest_hour: int | None = Field(default=None, ge=0, le=23)


class EmailActionOut(BaseModel):
    ok: bool
    detail: str | None = None
