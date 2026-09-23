from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.deps import require_current_user
from app.db.session import get_db
from app.models.entities import Course, QuizAttempt, QuizQuestion, User
from app.schemas.workspace import QuizAttemptsIn, QuizAttemptsOut

router = APIRouter(prefix="/quiz", tags=["quiz"])


@router.post("/attempts", response_model=QuizAttemptsOut)
def record_attempts(payload: QuizAttemptsIn, user: User = Depends(require_current_user), db: Session = Depends(get_db)) -> QuizAttemptsOut:
    question_ids = {item.question_id for item in payload.items}
    questions = {question.id: question for question in db.query(QuizQuestion).filter(QuizQuestion.id.in_(question_ids)).all()}
    recorded = 0
    for item in payload.items:
        question = questions.get(item.question_id)
        if not question:
            continue
        course = db.get(Course, question.course_id)
        if not course:
            continue
        db.add(
            QuizAttempt(
                organization_id=course.organization_id,
                user_id=user.id,
                question_id=question.id,
                course_id=question.course_id,
                chapter_id=question.chapter_id,
                chosen=item.chosen,
                correct=item.correct,
            )
        )
        recorded += 1
    db.commit()
    return QuizAttemptsOut(recorded=recorded)
