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


class NoteCreateIn(BaseModel):
    course_id: str
    chapter_id: str | None = None
    video_time_seconds: float | None = None
    content: str = Field(min_length=1)


class NoteItem(BaseModel):
    id: str
    course_id: str
    course_title: str
    chapter_id: str | None = None
    chapter_title: str | None = None
    video_time_seconds: float | None = None
    content: str
    created_at: datetime | None = None


class NoteListOut(BaseModel):
    items: list[NoteItem]


class AdapterItem(BaseModel):
    id: str
    adapter_id: str
    name: str
    status: str
    host_patterns: dict


class AdapterListOut(BaseModel):
    items: list[AdapterItem]


class ExportCreateIn(BaseModel):
    course_id: str | None = None
    format: str = "markdown"


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
