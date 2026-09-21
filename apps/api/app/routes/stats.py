from datetime import date, timedelta

from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.deps import require_current_user
from app.db.session import get_db
from app.models.entities import Course, Note, TranscriptSegment, User, VideoCaptureEvent
from app.schemas.workspace import StatsDailyItem, StatsSummaryOut

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
