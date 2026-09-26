from datetime import UTC, date, datetime, time, timedelta

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


def _local_day(value: datetime | None) -> date | None:
    """把库里的时间戳换算成本地日期。

    不能直接用 SQL 的 date():它按数据库会话时区分桶(测试用的 SQLite 更是按 UTC),
    而 today / since 都是本地日期 —— 本地 00:00~08:00(+08:00)这段会被算到前一天,
    「今日」计数与连续学习天数都会差一天。
    """
    if value is None:
        return None
    if value.tzinfo is None:
        value = value.replace(tzinfo=UTC)
    return value.astimezone().date()


def _daily_counts(db: Session, model, since: date, extra_filter=None) -> dict[str, int]:
    """按本地日期分桶统计(只取最近几天的 created_at,数据量可控)"""
    since_start = datetime.combine(since, time.min).astimezone()
    query = db.query(model.created_at).filter(model.created_at >= since_start)
    if extra_filter is not None:
        query = query.filter(extra_filter)
    counts: dict[str, int] = {}
    for (value,) in query.all():
        day = _local_day(value)
        if day is None:
            continue
        key = day.isoformat()
        counts[key] = counts.get(key, 0) + 1
    return counts


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
    # 批量取课程标题与章节(标题/排序),原来每组 2 次 + 排序键每组 1 次查询
    course_ids = {course_id for course_id, _ in grouped}
    chapter_ids = {chapter_id for _, chapter_id in grouped}
    course_titles = (
        {row.id: row.title for row in db.query(Course.id, Course.title).filter(Course.id.in_(course_ids)).all()}
        if course_ids
        else {}
    )
    chapters = (
        {
            row.id: (row.title, row.sort_order)
            for row in db.query(Chapter.id, Chapter.title, Chapter.sort_order).filter(Chapter.id.in_(chapter_ids)).all()
        }
        if chapter_ids
        else {}
    )
    chapter_titles = {chapter_id: title for chapter_id, (title, _) in chapters.items()}
    chapter_sorts = {chapter_id: sort_order for chapter_id, (_, sort_order) in chapters.items()}
    items: list[MasteryItem] = []
    for (attempt_course_id, attempt_chapter_id), bucket in grouped.items():
        items.append(
            MasteryItem(
                course_id=attempt_course_id,
                course_title=course_titles.get(attempt_course_id),
                chapter_id=attempt_chapter_id,
                chapter_title=chapter_titles.get(attempt_chapter_id),
                total=bucket["total"],
                correct=bucket["correct"],
                accuracy=round(bucket["correct"] / bucket["total"] * 100, 1),
                last_attempt_at=bucket["last_attempt_at"],
            )
        )
    items.sort(key=lambda item: (item.course_title or "", chapter_sorts.get(item.chapter_id, 0), item.chapter_title or ""))
    return MasteryOut(items=items)


def _activity_dates(db: Session, user_id: str) -> set[date]:
    """当前用户有学习活动的本地日期集合(同样不能依赖 SQL 的 date(),见 _local_day)"""
    # 连续学习天数不需要看很久以前;限定窗口避免全表扫描
    since = datetime.combine(date.today() - timedelta(days=400), time.min).astimezone()
    queries = [
        db.query(VideoSession.started_at).filter(VideoSession.user_id == user_id, VideoSession.started_at >= since),
        db.query(Note.created_at).filter(Note.user_id == user_id, Note.created_at >= since),
        db.query(QuizAttempt.created_at).filter(QuizAttempt.user_id == user_id, QuizAttempt.created_at >= since),
        db.query(ReviewLog.reviewed_at)
        .join(ReviewCard, ReviewLog.card_id == ReviewCard.id)
        .filter(ReviewCard.user_id == user_id, ReviewLog.reviewed_at >= since),
    ]
    dates: set[date] = set()
    for query in queries:
        for (value,) in query.all():
            day = _local_day(value)
            if day is not None:
                dates.add(day)
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

    # 一次取回全部章节与全部"已学"章节,原来每门课 4 次查询
    courses = db.query(Course).order_by(Course.updated_at.desc()).all()
    course_ids = [course.id for course in courses]
    all_chapters = db.query(Chapter).filter(Chapter.course_id.in_(course_ids)).all() if course_ids else []
    chapters_by_course: dict[str, list[Chapter]] = {}
    for chapter in all_chapters:
        chapters_by_course.setdefault(chapter.course_id, []).append(chapter)
    # 只统计叶子章节(可学习单元),父章节只是目录
    leaves_by_course: dict[str, list[Chapter]] = {}
    for course_id, chapters in chapters_by_course.items():
        parent_ids = {chapter.parent_id for chapter in chapters if chapter.parent_id}
        leaves_by_course[course_id] = [chapter for chapter in chapters if chapter.id not in parent_ids]
    all_leaf_ids = [chapter.id for leaves in leaves_by_course.values() for chapter in leaves]
    studied_ids: set[str] = set()
    if all_leaf_ids:
        studied_ids = (
            {row[0] for row in db.query(VideoSession.chapter_id).filter(VideoSession.chapter_id.in_(all_leaf_ids), VideoSession.user_id == user.id).distinct().all()}
            | {row[0] for row in db.query(Note.chapter_id).filter(Note.chapter_id.in_(all_leaf_ids), Note.user_id == user.id).distinct().all()}
            | {row[0] for row in db.query(Screenshot.chapter_id).filter(Screenshot.chapter_id.in_(all_leaf_ids), Screenshot.user_id == user.id).distinct().all()}
        )
    progress_items: list[CourseProgressItem] = []
    for course in courses:
        leaves = leaves_by_course.get(course.id, [])
        if not leaves:
            continue
        studied = studied_ids.intersection({chapter.id for chapter in leaves})
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
