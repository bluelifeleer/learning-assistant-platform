from pydantic import BaseModel, Field


class ChapterSnapshotIn(BaseModel):
    external_chapter_id: str
    title: str
    sort_order: int = 0
    duration_seconds: int | None = None
    children: list["ChapterSnapshotIn"] = Field(default_factory=list)


class CourseSnapshotIn(BaseModel):
    adapter_id: str
    site_url: str
    external_course_id: str
    course_title: str
    term: str | None = None
    chapters: list[ChapterSnapshotIn] = Field(default_factory=list)


class VideoEventIn(BaseModel):
    session_id: str
    event_type: str
    video_time_seconds: float | None = None
    payload: dict = Field(default_factory=dict)


class TranscriptSegmentIn(BaseModel):
    external_course_id: str
    external_chapter_id: str
    session_id: str | None = None
    start_seconds: float | None = None
    end_seconds: float | None = None
    text: str = Field(min_length=1)
    source: str
