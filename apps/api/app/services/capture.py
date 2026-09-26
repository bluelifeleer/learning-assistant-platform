import base64
import binascii
from datetime import UTC, datetime
import logging
from pathlib import Path

from fastapi import BackgroundTasks, HTTPException, status
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.models.entities import ApiToken, Chapter, Course, Membership, Note, NoteImage, Screenshot, Site, TranscriptSegment, User, VideoCaptureEvent, VideoSession
from app.schemas.capture import ChapterSnapshotIn, CourseSnapshotIn, NoteCaptureIn, NoteImageCaptureIn, ScreenshotCaptureIn, TranscriptSegmentIn, VideoEventIn
from app.services import ai_tasks
from app.services.plugins import hash_plugin_token

logger = logging.getLogger(__name__)

MAX_SCREENSHOT_BYTES = 8 * 1024 * 1024

# 会更新 VideoSession(学习时长/连续天数/继续学习)的事件类型。
# 扩展在播放中每 30s 发一次 progress,后端按 max(video_time_seconds) 记录最远进度。
SESSION_TRACKING_EVENTS = frozenset({"play", "progress"})


def screenshots_dir_path() -> Path:
    configured = Path(get_settings().screenshots_dir)
    directory = configured if configured.is_absolute() else Path(__file__).resolve().parents[2] / configured
    directory.mkdir(parents=True, exist_ok=True)
    return directory


def note_images_dir_path() -> Path:
    configured = Path(get_settings().note_images_dir)
    directory = configured if configured.is_absolute() else Path(__file__).resolve().parents[2] / configured
    directory.mkdir(parents=True, exist_ok=True)
    return directory


def decode_base64_image(image_base64: str, too_large_detail: str = "Image too large") -> tuple[bytes, str]:
    data = image_base64
    suffix = ".jpg"
    if data.startswith("data:"):
        header, _, data = data.partition(",")
        mime = header[5:].split(";")[0].strip().lower()
        suffix = ".png" if mime == "image/png" else ".jpg"
    try:
        content = base64.b64decode(data, validate=True)
    except (binascii.Error, ValueError):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid image data") from None
    if not content:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Empty image data")
    if len(content) > MAX_SCREENSHOT_BYTES:
        raise HTTPException(status_code=status.HTTP_413_CONTENT_TOO_LARGE, detail=too_large_detail)
    return content, suffix


class CaptureService:
    def __init__(self, db: Session):
        self.db = db

    def _plugin_token(self, bearer_token: str) -> ApiToken:
        token_hash = hash_plugin_token(bearer_token)
        now = datetime.now(UTC)
        token = (
            self.db.query(ApiToken)
            .filter(
                ApiToken.token_hash == token_hash,
                ApiToken.revoked_at.is_(None),
                or_(ApiToken.expires_at.is_(None), ApiToken.expires_at > now),
            )
            .first()
        )
        if not token:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid plugin token")
        return token

    def _organization_id_for_plugin_token(self, bearer_token: str) -> str:
        return self._plugin_token(bearer_token).organization_id

    def _upsert_site(self, payload: CourseSnapshotIn) -> Site:
        site = self.db.query(Site).filter(Site.adapter_id == payload.adapter_id).first()
        if site:
            site.host_patterns = {**(site.host_patterns or {}), "last_seen_url": payload.site_url}
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
        if chapter_in.extra:
            chapter.extra = {**(chapter.extra or {}), **chapter_in.extra}
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
        if payload.extra:
            course.extra = {**(course.extra or {}), **payload.extra}
        self.db.flush()
        for chapter in payload.chapters:
            self._upsert_chapter(course, chapter)
        self.db.commit()
        return {"status": "accepted", "external_course_id": payload.external_course_id, "course_id": course.id}

    def accept_video_event(self, bearer_token: str, payload: VideoEventIn) -> dict[str, str]:
        token = self._plugin_token(bearer_token)
        organization_id = token.organization_id
        event_payload = payload.payload or {}
        event = VideoCaptureEvent(
            organization_id=organization_id,
            session_id=payload.session_id,
            event_type=payload.event_type,
            video_time_seconds=payload.video_time_seconds,
            course_url=event_payload.get("course_url"),
            external_course_id=event_payload.get("external_course_id"),
            external_chapter_id=event_payload.get("external_chapter_id"),
            video_source=event_payload.get("video_source") or {},
            payload=event_payload,
        )
        self.db.add(event)
        self.db.flush()
        if payload.event_type in SESSION_TRACKING_EVENTS:
            # 追踪学习会话,填充 VideoSession 供学习时长/连续天数/继续学习等统计使用。
            # 会话追踪失败不应阻断播放事件本身的上报。
            # 注意也必须处理 progress:只在 play 那一刻采样的话,
            # 从头看到尾的视频会把时长记成 0(play 事件发生在 currentTime≈0 时)。
            try:
                self._upsert_video_session(token, payload, event_payload)
            except Exception:
                logger.exception("failed to track video session for %s", payload.session_id)
        self.db.commit()
        return {"status": "accepted", "session_id": payload.session_id}

    def _upsert_video_session(self, token: ApiToken, payload: VideoEventIn, event_payload: dict) -> None:
        external_course_id = event_payload.get("external_course_id")
        if not external_course_id:
            return
        course = (
            self.db.query(Course)
            .filter(Course.organization_id == token.organization_id, Course.external_course_id == external_course_id)
            .first()
        )
        if not course:
            return
        external_chapter_id = event_payload.get("external_chapter_id")
        chapter = None
        if external_chapter_id:
            chapter = (
                self.db.query(Chapter)
                .filter(Chapter.course_id == course.id, Chapter.external_chapter_id == external_chapter_id)
                .first()
            )
        if not chapter:
            return
        user_id = self._capture_user_id(token)
        session = (
            self.db.query(VideoSession)
            .filter(VideoSession.external_session_id == payload.session_id, VideoSession.user_id == user_id)
            .first()
        )
        video_source = event_payload.get("video_source") or {}
        source_url = (
            event_payload.get("course_url")
            or video_source.get("currentSrc")
            or video_source.get("current_src")
            or ""
        )
        now = datetime.now(UTC)
        if not session:
            session = VideoSession(
                external_session_id=payload.session_id,
                course_id=course.id,
                chapter_id=chapter.id,
                user_id=user_id,
                started_at=now,
                duration_watched_seconds=0,
                source_url=source_url,
            )
            self.db.add(session)
        else:
            if source_url:
                session.source_url = source_url
            session.ended_at = None
        if payload.video_time_seconds is not None:
            reached = max(0, int(float(payload.video_time_seconds)))
            if reached > (session.duration_watched_seconds or 0):
                session.duration_watched_seconds = reached
        self.db.flush()

    def accept_transcript_segment(self, bearer_token: str, payload: TranscriptSegmentIn, background_tasks: BackgroundTasks | None = None) -> dict[str, str]:
        organization_id = self._organization_id_for_plugin_token(bearer_token)
        course = self.db.query(Course).filter(Course.organization_id == organization_id, Course.external_course_id == payload.external_course_id).first()
        if not course:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Course not found")
        chapter = self.db.query(Chapter).filter(Chapter.course_id == course.id, Chapter.external_chapter_id == payload.external_chapter_id).first()
        if not chapter:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Chapter not found")
        duplicate_query = self.db.query(TranscriptSegment).filter(
            TranscriptSegment.course_id == course.id,
            TranscriptSegment.chapter_id == chapter.id,
            TranscriptSegment.text == payload.text,
        )
        if payload.start_seconds is None:
            duplicate_query = duplicate_query.filter(TranscriptSegment.start_seconds.is_(None))
        else:
            duplicate_query = duplicate_query.filter(TranscriptSegment.start_seconds == payload.start_seconds)
        existing = duplicate_query.first()
        if existing:
            return {"status": "accepted", "external_course_id": payload.external_course_id, "segment_id": existing.id}
        video_session_id = None
        if payload.session_id:
            # 扩展上报的 session_id 是合成值(adapter:course:chapter),落在
            # VideoSession.external_session_id,不是主键 —— 之前拿主键比对,永远匹配不上,
            # 导致字幕段从不关联到视频会话。这里与 play 事件(见上文)用同一种查法,
            # 并同样按用户过滤(同一课程+章节的 external_session_id 在不同用户间会重复)。
            user_id = self._capture_user_id(self._plugin_token(bearer_token))
            video_session = (
                self.db.query(VideoSession)
                .filter(VideoSession.external_session_id == payload.session_id, VideoSession.user_id == user_id)
                .first()
            )
            if video_session:
                video_session_id = video_session.id
        segment = TranscriptSegment(
            course_id=course.id,
            chapter_id=chapter.id,
            video_session_id=video_session_id,
            start_seconds=payload.start_seconds,
            end_seconds=payload.end_seconds,
            text=payload.text,
            source=payload.source,
        )
        self.db.add(segment)
        self.db.commit()
        if background_tasks is not None:
            ai_tasks.maybe_auto_generate_chapter_summary(self.db, background_tasks, course, chapter)
        return {"status": "accepted", "external_course_id": payload.external_course_id, "segment_id": segment.id}

    def accept_note(self, bearer_token: str, payload: NoteCaptureIn) -> dict[str, str]:
        token = self._plugin_token(bearer_token)
        organization_id = token.organization_id
        course = self.db.query(Course).filter(Course.organization_id == organization_id, Course.external_course_id == payload.external_course_id).first()
        if not course:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="course not found, snapshot first")
        chapter = None
        if payload.external_chapter_id:
            chapter = (
                self.db.query(Chapter).filter(Chapter.course_id == course.id, Chapter.external_chapter_id == payload.external_chapter_id).first()
            )
        user_id = token.user_id
        if not user_id:
            member_user = (
                self.db.query(User)
                .join(Membership, Membership.user_id == User.id)
                .filter(Membership.organization_id == organization_id)
                .order_by(User.created_at.asc())
                .first()
            )
            fallback = member_user or self.db.query(User).order_by(User.created_at.asc()).first()
            if not fallback:
                raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="No user available for note capture")
            user_id = fallback.id
        content = payload.content
        if payload.source_text:
            content = f"> {payload.source_text}\n\n{content}"
        note = Note(
            course_id=course.id,
            chapter_id=chapter.id if chapter else None,
            user_id=user_id,
            video_time_seconds=payload.video_time_seconds,
            content=content,
            tags=[tag for tag in payload.tags if tag],
        )
        self.db.add(note)
        self.db.commit()
        return {"status": "accepted", "external_course_id": payload.external_course_id, "note_id": note.id}

    def _capture_user_id(self, token: ApiToken) -> str:
        if token.user_id:
            return token.user_id
        member_user = (
            self.db.query(User)
            .join(Membership, Membership.user_id == User.id)
            .filter(Membership.organization_id == token.organization_id)
            .order_by(User.created_at.asc())
            .first()
        )
        fallback = member_user or self.db.query(User).order_by(User.created_at.asc()).first()
        if not fallback:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="No user available for capture")
        return fallback.id

    def _decode_image(self, image_base64: str) -> tuple[bytes, str]:
        return decode_base64_image(image_base64, too_large_detail="Screenshot too large")

    def accept_screenshot(self, bearer_token: str, payload: ScreenshotCaptureIn) -> dict[str, str]:
        token = self._plugin_token(bearer_token)
        organization_id = token.organization_id
        course = self.db.query(Course).filter(Course.organization_id == organization_id, Course.external_course_id == payload.external_course_id).first()
        if not course:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="course not found, snapshot first")
        chapter = None
        if payload.external_chapter_id:
            chapter = (
                self.db.query(Chapter).filter(Chapter.course_id == course.id, Chapter.external_chapter_id == payload.external_chapter_id).first()
            )
        user_id = self._capture_user_id(token)
        content, suffix = self._decode_image(payload.image_base64)
        screenshot = Screenshot(
            organization_id=organization_id,
            course_id=course.id,
            chapter_id=chapter.id if chapter else None,
            user_id=user_id,
            video_time_seconds=payload.video_time_seconds,
            file_path="",
        )
        self.db.add(screenshot)
        self.db.flush()
        path = screenshots_dir_path() / f"{screenshot.id}{suffix}"
        path.write_bytes(content)
        screenshot.file_path = str(path)
        self.db.commit()
        return {"id": screenshot.id, "status": "ok"}

    def accept_note_image(self, bearer_token: str, payload: NoteImageCaptureIn) -> dict[str, str]:
        token = self._plugin_token(bearer_token)
        user_id = self._capture_user_id(token)
        content, suffix = decode_base64_image(payload.image_base64, too_large_detail="Image too large")
        note_image = NoteImage(
            organization_id=token.organization_id,
            user_id=user_id,
            file_path="",
        )
        self.db.add(note_image)
        self.db.flush()
        path = note_images_dir_path() / f"{note_image.id}{suffix}"
        path.write_bytes(content)
        note_image.file_path = str(path)
        self.db.commit()
        return {"id": note_image.id, "status": "ok"}
