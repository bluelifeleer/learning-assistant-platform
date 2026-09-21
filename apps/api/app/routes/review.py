from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.deps import require_current_user
from app.db.session import get_db
from app.models.entities import Course, Note, ReviewCard, TranscriptSegment, User
from app.schemas.review import ReviewAnswerIn, ReviewCardCreateIn, ReviewCardListOut, ReviewCardOut
from app.services.review import ReviewService, utc_now

router = APIRouter(prefix="/review", tags=["review"])

CONTEXT_WINDOW_SECONDS = 10


def card_out(card: ReviewCard) -> ReviewCardOut:
    return ReviewCardOut(
        id=card.id,
        note_id=card.note_id,
        course_id=card.course_id,
        chapter_id=card.chapter_id,
        user_id=card.user_id,
        front=card.front,
        back=card.back,
        ease_factor=card.ease_factor,
        interval_days=card.interval_days,
        due_at=card.due_at,
        review_count=card.review_count,
        created_at=card.created_at,
    )


def get_review_service(db: Session = Depends(get_db)) -> ReviewService:
    return ReviewService(db)


@router.post("/cards", response_model=ReviewCardOut)
def create_card(payload: ReviewCardCreateIn, user: User = Depends(require_current_user), db: Session = Depends(get_db)) -> ReviewCardOut:
    note = db.query(Note).filter(Note.id == payload.note_id).first()
    if not note:
        raise HTTPException(status_code=404, detail="Note not found")
    course = db.query(Course).filter(Course.id == note.course_id).first()
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")
    back = ""
    if note.chapter_id and note.video_time_seconds is not None:
        center = float(note.video_time_seconds)
        segments = (
            db.query(TranscriptSegment)
            .filter(
                TranscriptSegment.chapter_id == note.chapter_id,
                TranscriptSegment.start_seconds.isnot(None),
                TranscriptSegment.start_seconds >= center - CONTEXT_WINDOW_SECONDS,
                TranscriptSegment.start_seconds <= center + CONTEXT_WINDOW_SECONDS,
            )
            .order_by(TranscriptSegment.start_seconds.asc())
            .all()
        )
        back = "\n".join(segment.text for segment in segments)
    card = ReviewCard(
        organization_id=course.organization_id,
        note_id=note.id,
        course_id=note.course_id,
        chapter_id=note.chapter_id,
        user_id=user.id,
        front=note.content,
        back=back,
        due_at=utc_now(),
    )
    db.add(card)
    db.commit()
    db.refresh(card)
    return card_out(card)


@router.get("/due", response_model=ReviewCardListOut)
def due_cards(_: User = Depends(require_current_user), db: Session = Depends(get_db)) -> ReviewCardListOut:
    cards = db.query(ReviewCard).filter(ReviewCard.due_at <= utc_now()).order_by(ReviewCard.due_at.asc()).all()
    return ReviewCardListOut(items=[card_out(card) for card in cards])


@router.get("/cards", response_model=ReviewCardListOut)
def list_cards(_: User = Depends(require_current_user), db: Session = Depends(get_db)) -> ReviewCardListOut:
    cards = db.query(ReviewCard).order_by(ReviewCard.created_at.desc()).all()
    return ReviewCardListOut(items=[card_out(card) for card in cards])


@router.post("/cards/{card_id}/answer", response_model=ReviewCardOut)
def answer_card(
    card_id: str,
    payload: ReviewAnswerIn,
    _: User = Depends(require_current_user),
    db: Session = Depends(get_db),
    service: ReviewService = Depends(get_review_service),
) -> ReviewCardOut:
    card = db.query(ReviewCard).filter(ReviewCard.id == card_id).first()
    if not card:
        raise HTTPException(status_code=404, detail="Card not found")
    return card_out(service.answer(card, payload.result))
