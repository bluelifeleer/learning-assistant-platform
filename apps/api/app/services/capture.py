from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.models.entities import ApiToken, Chapter, Course, Site, TranscriptSegment
from app.schemas.capture import ChapterSnapshotIn, CourseSnapshotIn, TranscriptSegmentIn, VideoEventIn
from app.services.plugins import hash_plugin_token


class CaptureService:
    def __init__(self, db: Session):
        self.db = db

    def _organization_id_for_plugin_token(self, bearer_token: str) -> str:
        token_hash = hash_plugin_token(bearer_token)
        token = self.db.query(ApiToken).filter(ApiToken.token_hash == token_hash, ApiToken.revoked_at.is_(None)).first()
        if not token:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid plugin token")
        return token.organization_id

    def _upsert_site(self, payload: CourseSnapshotIn) -> Site:
        site = self.db.query(Site).filter(Site.adapter_id == payload.adapter_id).first()
        if site:
            site.host_patterns = {"last_seen_url": payload.site_url}
            return site
        site = Site(adapter_id=payload.adapter_id, name=payload.adapter_id, host_patterns={"last_seen_url": payload.site_url}, status="enabled")
        self.db.add(site)
        self.db.flush()
        return site

    def _upsert_chapter(self, course: Course, chapter_in: ChapterSnapshotIn, parent_id: str | None = None) -> None:
        chapter = self.db.query(Chapter).filter(Chapter.course_id == course.id, Chapter.external_chapter_id == chapter_in.external_chapter_id).first()
        if not chapter:
            chapter = Chapter(course_id=course.id, external_chapter_id=chapter_in.external_chapter_id, title=chapter_in.title)
            self.db.add(chapter)
        chapter.parent_id = parent_id
        chapter.title = chapter_in.title
        chapter.sort_order = chapter_in.sort_order
        chapter.duration_seconds = chapter_in.duration_seconds
        chapter.extra = {}
        self.db.flush()
        for child in chapter_in.children:
            self._upsert_chapter(course, child, parent_id=chapter.id)

    def accept_course_snapshot(self, bearer_token: str, payload: CourseSnapshotIn) -> dict[str, str]:
        organization_id = self._organization_id_for_plugin_token(bearer_token)
        site = self._upsert_site(payload)
        course = (
            self.db.query(Course)
            .filter(Course.organization_id == organization_id, Course.site_id == site.id, Course.external_course_id == payload.external_course_id)
            .first()
        )
        if not course:
            course = Course(organization_id=organization_id, site_id=site.id, external_course_id=payload.external_course_id, title=payload.course_title)
            self.db.add(course)
        course.title = payload.course_title
        course.term = payload.term
        course.extra = {}
        self.db.flush()
        for chapter in payload.chapters:
            self._upsert_chapter(course, chapter)
        self.db.commit()
        return {"status": "accepted", "external_course_id": payload.external_course_id, "course_id": course.id}

    def accept_video_event(self, payload: VideoEventIn) -> dict[str, str]:
        return {"status": "accepted", "session_id": payload.session_id}

    def accept_transcript_segment(self, bearer_token: str, payload: TranscriptSegmentIn) -> dict[str, str]:
        organization_id = self._organization_id_for_plugin_token(bearer_token)
        course = self.db.query(Course).filter(Course.organization_id == organization_id, Course.external_course_id == payload.external_course_id).first()
        if not course:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Course not found")
        chapter = self.db.query(Chapter).filter(Chapter.course_id == course.id, Chapter.external_chapter_id == payload.external_chapter_id).first()
        if not chapter:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Chapter not found")
        segment = TranscriptSegment(
            course_id=course.id,
            chapter_id=chapter.id,
            video_session_id=None,
            start_seconds=payload.start_seconds,
            end_seconds=payload.end_seconds,
            text=payload.text,
            source=payload.source,
        )
        self.db.add(segment)
        self.db.commit()
        return {"status": "accepted", "external_course_id": payload.external_course_id, "segment_id": segment.id}
