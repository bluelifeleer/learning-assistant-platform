"""从历史 video_capture_events 重建 video_sessions(学习时长统计)。

背景:VideoSession 的采集(_upsert_video_session)是在提交 2570bf5 才加入的。
在那之前扩展已经上报过大量 play 事件,但它们不会产生会话,于是
「本周学习 N/300 分钟」「连续学习天数」「继续学习」全部显示为 0。

    python -m scripts.backfill_video_sessions                     # 预演,只打印
    python -m scripts.backfill_video_sessions --apply             # 补出缺失的会话
    python -m scripts.backfill_video_sessions --apply --recompute # 同时按新规则重算已有会话

幂等:已存在同 (external_session_id, user_id) 的会话默认跳过。

--recompute 用于把 duration_watched_seconds 从旧的「视频最远进度」语义
重算成「实际观看时长」(见 app.services.capture.watched_seconds_between)。
"""

from __future__ import annotations

import argparse
import sys
from collections import defaultdict
from datetime import datetime

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db.session import SessionLocal
from app.models.entities import Chapter, Course, Membership, Screenshot, VideoCaptureEvent, VideoSession
from app.services.capture import SESSION_TRACKING_EVENTS, watched_seconds_between


def _organization_user(db: Session, organization_id: str) -> str | None:
    """事件表没有 user_id,只能按组织反查成员。

    只有一个成员时直接用它;多个成员时无法判断归属,交给调用方报错跳过。
    """
    user_ids = list(
        db.scalars(select(Membership.user_id).where(Membership.organization_id == organization_id)).all()
    )
    return user_ids[0] if len(user_ids) == 1 else None


def _parse_time(value) -> datetime | None:
    if isinstance(value, datetime):
        return value
    if isinstance(value, str):
        try:
            return datetime.fromisoformat(value)
        except ValueError:
            return None
    return None


def accumulated_watch_seconds(group: list[VideoCaptureEvent]) -> tuple[int, float | None, datetime | None]:
    """按事件序列还原真实观看时长,与后端实时累计用同一套规则。

    返回 (累计秒数, 最后一次的位置, 最后一次的时间)。
    """
    total = 0
    previous_position: float | None = None
    previous_at: datetime | None = None
    for event in group:
        at = _parse_time(event.created_at)
        if event.video_time_seconds is not None and at is not None:
            position = max(0.0, float(event.video_time_seconds))
            total += watched_seconds_between(previous_position, previous_at, position, at)
            previous_position = position
        previous_at = at
    return total, previous_position, previous_at


def _chapter_from_screenshots(
    db: Session,
    organization_id: str,
    external_course_id: str | None,
    started_at: datetime | None,
    ended_at: datetime | None,
) -> Chapter | None:
    """兜底:用同一时段该课程的截图反推章节。

    修复前扩展上报的章节 id 是 wencai-item:<scorm_item_id>,库里没有对应章节,
    事件本身无法归属;但同一时段的截图带的是真实 chapter_id。
    取同时段出现次数最多的章节(即这次学习主要停留的地方)。
    """
    if not external_course_id or started_at is None or ended_at is None:
        return None
    row = db.execute(
        select(Chapter.id, func.count(Screenshot.id))
        .join(Screenshot, Screenshot.chapter_id == Chapter.id)
        .join(Course, Course.id == Screenshot.course_id)
        .where(
            Course.organization_id == organization_id,
            Course.external_course_id == external_course_id,
            Screenshot.created_at >= started_at,
            Screenshot.created_at <= ended_at,
        )
        .group_by(Chapter.id)
        .order_by(func.count(Screenshot.id).desc())
        .limit(1)
    ).first()
    return db.get(Chapter, row[0]) if row else None


def _resolve_target(
    db: Session,
    organization_id: str,
    group: list[VideoCaptureEvent],
    started_at: datetime | None,
    ended_at: datetime | None,
) -> tuple[Course | None, Chapter | None, dict, str]:
    """解析会话归属的课程与章节,返回 (course, chapter, payload, 来源说明)。"""
    fallback_course: Course | None = None
    fallback_payload: dict = {}
    for event in reversed(group):
        payload = event.payload or {}
        course = db.scalar(
            select(Course).where(
                Course.organization_id == organization_id,
                Course.external_course_id == (payload.get("external_course_id") or ""),
            )
        )
        if not course:
            continue
        if fallback_course is None:
            fallback_course, fallback_payload = course, payload
        chapter = db.scalar(
            select(Chapter).where(
                Chapter.course_id == course.id,
                Chapter.external_chapter_id == (payload.get("external_chapter_id") or ""),
            )
        )
        if chapter is not None:
            return course, chapter, payload, "事件"

    if fallback_course is not None:
        chapter = _chapter_from_screenshots(
            db, organization_id, fallback_course.external_course_id, started_at, ended_at
        )
        if chapter is not None:
            return fallback_course, chapter, fallback_payload, "同时段截图反推"

    return fallback_course, None, fallback_payload, "无法解析"


def backfill(db: Session, *, apply: bool, recompute: bool) -> tuple[int, int, int, int]:
    events = list(
        db.scalars(
            select(VideoCaptureEvent)
            .where(VideoCaptureEvent.event_type.in_(SESSION_TRACKING_EVENTS))
            .order_by(VideoCaptureEvent.created_at.asc())
        ).all()
    )
    grouped: dict[str, list[VideoCaptureEvent]] = defaultdict(list)
    for event in events:
        grouped[event.session_id].append(event)

    created = updated = skipped = unresolved = 0

    for session_id, group in grouped.items():
        organization_id = group[0].organization_id
        user_id = _organization_user(db, organization_id)
        if user_id is None:
            print(f"  跳过 {session_id}:该组织有多个成员,无法判断归属")
            unresolved += 1
            continue

        duration, last_position, last_at = accumulated_watch_seconds(group)

        existing = db.scalar(
            select(VideoSession).where(
                VideoSession.external_session_id == session_id,
                VideoSession.user_id == user_id,
            )
        )
        if existing is not None:
            if not recompute:
                skipped += 1
                continue
            before = existing.duration_watched_seconds or 0
            existing.duration_watched_seconds = duration
            existing.last_position_seconds = last_position
            existing.last_event_at = last_at
            updated += 1
            print(f"  ~ 重算 {duration // 60} 分钟(原 {before // 60} 分钟) | {session_id[:56]}")
            continue

        started_at = _parse_time(group[0].created_at)
        ended_at = _parse_time(group[-1].created_at)
        course, chapter, payload, source = _resolve_target(db, organization_id, group, started_at, ended_at)
        if course is None or chapter is None:
            print(f"  跳过 {session_id}:事件里的课程/章节 id 在库中不存在,同时段也没有截图可参考")
            unresolved += 1
            continue

        video_source = payload.get("video_source") or {}
        source_url = (
            payload.get("course_url")
            or video_source.get("currentSrc")
            or video_source.get("current_src")
            or ""
        )
        print(
            f"  + {duration // 60} 分钟 | {course.title[:16]} / {chapter.title[:18]} | {started_at} | 章节来源: {source}"
        )
        created += 1
        if apply:
            db.add(
                VideoSession(
                    external_session_id=session_id,
                    course_id=course.id,
                    chapter_id=chapter.id,
                    user_id=user_id,
                    started_at=started_at,
                    ended_at=ended_at,
                    duration_watched_seconds=duration,
                    last_position_seconds=last_position,
                    last_event_at=last_at,
                    source_url=source_url,
                )
            )

    if apply and (created or updated):
        db.commit()
    return created, updated, skipped, unresolved


def main() -> int:
    parser = argparse.ArgumentParser(description="从历史播放事件重建学习会话")
    parser.add_argument("--apply", action="store_true", help="实际写入(默认只预演)")
    parser.add_argument("--recompute", action="store_true", help="已有的会话也按新规则重算时长")
    args = parser.parse_args()

    db = SessionLocal()
    try:
        created, updated, skipped, unresolved = backfill(db, apply=args.apply, recompute=args.recompute)
    finally:
        db.close()

    mode = "已写入" if args.apply else "预演(未写入,加 --apply 生效)"
    print(
        f"\n{mode}:新建 {created} 个,重算 {updated} 个,"
        f"跳过已存在 {skipped} 个,无法归属 {unresolved} 个"
    )
    if not args.apply and (created or updated):
        print("确认无误后重新执行: python -m scripts.backfill_video_sessions --apply")
    return 0


if __name__ == "__main__":
    sys.exit(main())
