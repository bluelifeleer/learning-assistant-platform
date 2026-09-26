from datetime import date, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.deps import require_current_user
from app.db.session import get_db
from app.models.entities import (
    Chapter,
    Course,
    Note,
    QuizAttempt,
    ReviewLog,
    ReviewCard,
    Screenshot,
    TranscriptSegment,
    User,
    VideoCaptureEvent,
    VideoSession,
)
from app.schemas.workspace import (
    ContinueLearningItem,
    CourseProgressItem,
    LearningProgressOut,
    MasteryItem,
    MasteryOut,
    StatsDailyItem,
    StatsSummaryOut,
)
from app.services.plugins import ensure_default_organization

router = APIRouter(prefix="/stats", tags=["stats"])

PLAY_EVENT_TYPE = "play"


def _count(db: Session, model) -> int:
    return db.query(func.count(model.id)).scalar() or 0


def _daily_counts(db: Session, model, since: date, extra_filter=None) -> dict[str, int]:
    query = db.query(func.date(model.created_at), func.count(model.id)).filter(model.created_at >= since)
    if extra_filter is not None:
        query = query.filter(extra_filter)
    return {str(day): count for day, count in query.group_by(func.date(model.created_at)).all()}


@router.get("/summary", response_model=StatsSummaryOut)
def summary(_: User = Depends(require_current_user), db: Session = Depends(get_db)) -> StatsSummaryOut:
    today = date.today()
    since = today - timedelta(days=6)
    note_counts = _daily_counts(db, Note, since)
    play_filter = VideoCaptureEvent.event_type == PLAY_EVENT_TYPE
    play_counts = _daily_counts(db, VideoCaptureEvent, since, extra_filter=play_filter)
    daily = [
        StatsDailyItem(
            date=(since + timedelta(days=offset)).isoformat(),
            notes=note_counts.get((since + timedelta(days=offset)).isoformat(), 0),
            play_events=play_counts.get((since + timedelta(days=offset)).isoformat(), 0),
        )
        for offset in range(7)
    ]
    return StatsSummaryOut(
        courses=_count(db, Course),
        notes=_count(db, Note),
        transcripts=_count(db, TranscriptSegment),
        play_events=db.query(func.count(VideoCaptureEvent.id)).filter(play_filter).scalar() or 0,
        daily=daily,
    )


@router.get("/mastery", response_model=MasteryOut)
def mastery(course_id: str | None = None, user: User = Depends(require_current_user), db: Session = Depends(get_db)) -> MasteryOut:
    if course_id and not db.get(Course, course_id):
        raise HTTPException(status_code=404, detail="Course not found")
    # 掌握度只按当前登录用户聚合,不包含组织内其他用户的答题记录
    query = db.query(QuizAttempt).filter(QuizAttempt.user_id == user.id)
    if course_id:
        query = query.filter(QuizAttempt.course_id == course_id)
    attempts = query.all()
    grouped: dict[tuple[str, str], dict] = {}
    for attempt in attempts:
        key = (attempt.course_id, attempt.chapter_id)
        bucket = grouped.setdefault(key, {"total": 0, "correct": 0, "last_attempt_at": None})
        bucket["total"] += 1
        bucket["correct"] += 1 if attempt.correct else 0
        if bucket["last_attempt_at"] is None or (attempt.created_at and attempt.created_at > bucket["last_attempt_at"]):
            bucket["last_attempt_at"] = attempt.created_at
    items: list[MasteryItem] = []
    for (attempt_course_id, attempt_chapter_id), bucket in grouped.items():
        course = db.get(Course, attempt_course_id)
        chapter = db.get(Chapter, attempt_chapter_id)
        items.append(
            MasteryItem(
                course_id=attempt_course_id,
                course_title=course.title if course else None,
                chapter_id=attempt_chapter_id,
                chapter_title=chapter.title if chapter else None,
                total=bucket["total"],
                correct=bucket["correct"],
                accuracy=round(bucket["correct"] / bucket["total"] * 100, 1),
                last_attempt_at=bucket["last_attempt_at"],
            )
        )
    items.sort(key=lambda item: (item.course_title or "", _chapter_sort_order(db, item.chapter_id), item.chapter_title or ""))
    return MasteryOut(items=items)


def _chapter_sort_order(db: Session, chapter_id: str) -> int:
    chapter = db.get(Chapter, chapter_id)
    return chapter.sort_order if chapter else 0


def _activity_dates(db: Session, user_id: str) -> set[date]:
    """当前用户有学习活动的日期集合"""
    dates: set[date] = set()
    queries = [
        db.query(func.date(VideoSession.started_at)).filter(VideoSession.user_id == user_id),
        db.query(func.date(Note.created_at)).filter(Note.user_id == user_id),
        db.query(func.date(QuizAttempt.created_at)).filter(QuizAttempt.user_id == user_id),
        db.query(func.date(ReviewLog.reviewed_at)).join(ReviewCard, ReviewLog.card_id == ReviewCard.id).filter(ReviewCard.user_id == user_id),
    ]
    for query in queries:
        # func.date 在 SQLite 返回字符串、PG 返回 date,统一归一化为 date
        dates.update(date.fromisoformat(str(row[0])[:10]) for row in query.distinct().all() if row[0])
    return dates


def _streak_days(dates: set[date], today: date) -> int:
    """从今天(或昨天,今天还没学时)往回数连续学习天数"""
    cursor = today if today in dates else today - timedelta(days=1)
    streak = 0
    while cursor in dates:
        streak += 1
        cursor -= timedelta(days=1)
    return streak


@router.get("/learning-progress", response_model=LearningProgressOut)
def learning_progress(user: User = Depends(require_current_user), db: Session = Depends(get_db)) -> LearningProgressOut:
    organization = ensure_default_organization(db)
    today = date.today()
    # aware 本地周一 00:00,与 timezone=True 的 started_at 列比较时避免 naive/aware 偏差
    week_start = datetime.combine(today - timedelta(days=today.weekday()), datetime.min.time()).astimezone()

    week_seconds = (
        db.query(func.coalesce(func.sum(VideoSession.duration_watched_seconds), 0))
        .filter(VideoSession.user_id == user.id, VideoSession.started_at >= week_start)
        .scalar()
        or 0
    )

    courses = db.query(Course).order_by(Course.updated_at.desc()).all()
    progress_items: list[CourseProgressItem] = []
    for course in courses:
        chapters = db.query(Chapter).filter(Chapter.course_id == course.id).all()
        # 只统计叶子章节(可学习单元),父章节只是目录
        parent_ids = {chapter.parent_id for chapter in chapters if chapter.parent_id}
        leaves = [chapter for chapter in chapters if chapter.id not in parent_ids]
        if not leaves:
            continue
        leaf_ids = [chapter.id for chapter in leaves]
        studied = (
            {row[0] for row in db.query(VideoSession.chapter_id).filter(VideoSession.chapter_id.in_(leaf_ids), VideoSession.user_id == user.id).distinct().all()}
            | {row[0] for row in db.query(Note.chapter_id).filter(Note.chapter_id.in_(leaf_ids), Note.user_id == user.id).distinct().all()}
            | {row[0] for row in db.query(Screenshot.chapter_id).filter(Screenshot.chapter_id.in_(leaf_ids), Screenshot.user_id == user.id).distinct().all()}
        )
        progress_items.append(
            CourseProgressItem(
                course_id=course.id,
                course_title=course.title,
                total_chapters=len(leaves),
                studied_chapters=len(studied),
                progress_pct=round(len(studied) / len(leaves) * 100, 1),
            )
        )
    progress_items.sort(key=lambda item: item.progress_pct, reverse=True)

    continue_learning: ContinueLearningItem | None = None
    last_session = (
        db.query(VideoSession).filter(VideoSession.user_id == user.id).order_by(VideoSession.started_at.desc()).first()
    )
    if last_session:
        course = db.get(Course, last_session.course_id)
        chapter = db.get(Chapter, last_session.chapter_id)
        if course and chapter:
            continue_learning = ContinueLearningItem(
                course_id=course.id, course_title=course.title, chapter_id=chapter.id, chapter_title=chapter.title
            )
    if not continue_learning:
        last_note = db.query(Note).filter(Note.user_id == user.id, Note.chapter_id.isnot(None)).order_by(Note.created_at.desc()).first()
        if last_note:
            course = db.get(Course, last_note.course_id)
            chapter = db.get(Chapter, last_note.chapter_id)
            if course and chapter:
                continue_learning = ContinueLearningItem(
                    course_id=course.id, course_title=course.title, chapter_id=chapter.id, chapter_title=chapter.title
                )

    return LearningProgressOut(
        streak_days=_streak_days(_activity_dates(db, user.id), today),
        week_minutes=int(week_seconds // 60),
        weekly_goal_minutes=organization.weekly_goal_minutes,
        continue_learning=continue_learning,
        courses=progress_items,
    )
