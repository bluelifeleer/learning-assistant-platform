from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.deps import require_current_user
from app.db.session import get_db
from app.models.entities import Chapter, Course, Note, QuizAttempt, TranscriptSegment, User, VideoCaptureEvent
from app.schemas.workspace import MasteryItem, MasteryOut, StatsDailyItem, StatsSummaryOut

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
