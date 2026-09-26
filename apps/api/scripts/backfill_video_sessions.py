"""从历史 video_capture_events 重建 video_sessions(学习时长统计)。

背景:VideoSession 的采集(_upsert_video_session)是在提交 2570bf5 才加入的。
在那之前扩展已经上报过大量 play 事件,但它们不会产生会话,于是
「本周学习 N/300 分钟」「连续学习天数」「继续学习」全部显示为 0。

本脚本按 session_id 聚合已有 play 事件,把缺失的会话补出来:

    python -m scripts.backfill_video_sessions          # 预演,只打印
    python -m scripts.backfill_video_sessions --apply  # 实际写入

幂等:已存在同 (external_session_id, user_id) 的会话会跳过,重复执行安全。
"""

from __future__ import annotations

import argparse
import sys
from collections import defaultdict
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.session import SessionLocal
from app.models.entities import Chapter, Course, Membership, VideoCaptureEvent, VideoSession

TRACKING_EVENT_TYPES = ("play", "progress")


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


def backfill(db: Session, *, apply: bool) -> tuple[int, int, int]:
    events = list(
        db.scalars(
            select(VideoCaptureEvent)
            .where(VideoCaptureEvent.event_type.in_(TRACKING_EVENT_TYPES))
            .order_by(VideoCaptureEvent.created_at.asc())
        ).all()
    )
    grouped: dict[str, list[VideoCaptureEvent]] = defaultdict(list)
    for event in events:
        grouped[event.session_id].append(event)

    created = 0
    skipped = 0
    unresolved = 0

    for session_id, group in grouped.items():
        organization_id = group[0].organization_id
        user_id = _organization_user(db, organization_id)
        if user_id is None:
            print(f"  跳过 {session_id}:该组织有多个成员,无法判断归属")
            unresolved += 1
            continue

        existing = db.scalar(
            select(VideoSession).where(
                VideoSession.external_session_id == session_id,
                VideoSession.user_id == user_id,
            )
        )
        if existing is not None:
            skipped += 1
            continue

        # 用最后一条带 payload 的事件解析课程/章节(章节可能中途变化)
        course = chapter = None
        payload: dict = {}
        for event in reversed(group):
            candidate_payload = event.payload or {}
            candidate_course = db.scalar(
                select(Course).where(
                    Course.organization_id == organization_id,
                    Course.external_course_id == (candidate_payload.get("external_course_id") or ""),
                )
            )
            if not candidate_course:
                continue
            candidate_chapter = db.scalar(
                select(Chapter).where(
                    Chapter.course_id == candidate_course.id,
                    Chapter.external_chapter_id == (candidate_payload.get("external_chapter_id") or ""),
                )
            )
            course, chapter, payload = candidate_course, candidate_chapter, candidate_payload
            break
        if course is None or chapter is None:
            print(f"  跳过 {session_id}:事件里的课程/章节 id 在库中不存在(多为修复前上报的 wencai-item:*)")
            unresolved += 1
            continue

        started_at = _parse_time(group[0].created_at)
        ended_at = _parse_time(group[-1].created_at)
        times = [float(e.video_time_seconds) for e in group if e.video_time_seconds is not None]
        duration = max(0, int(max(times))) if times else 0
        video_source = payload.get("video_source") or {}
        source_url = (
            payload.get("course_url")
            or video_source.get("currentSrc")
            or video_source.get("current_src")
            or ""
        )

        print(
            f"  + {session_id[:64]} | {course.title[:16]} / {chapter.title[:18]} "
            f"| {started_at} | {duration // 60} 分钟"
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
                    source_url=source_url,
                )
            )

    if apply and created:
        db.commit()
    return created, skipped, unresolved


def main() -> int:
    parser = argparse.ArgumentParser(description="从历史播放事件重建学习会话")
    parser.add_argument("--apply", action="store_true", help="实际写入(默认只预演)")
    args = parser.parse_args()

    db = SessionLocal()
    try:
        created, skipped, unresolved = backfill(db, apply=args.apply)
    finally:
        db.close()

    mode = "已写入" if args.apply else "预演(未写入,加 --apply 生效)"
    print(f"\n{mode}:新建 {created} 个会话,跳过已存在 {skipped} 个,无法归属 {unresolved} 个")
    if not args.apply and created:
        print("确认无误后重新执行: python -m scripts.backfill_video_sessions --apply")
    return 0


if __name__ == "__main__":
    sys.exit(main())
