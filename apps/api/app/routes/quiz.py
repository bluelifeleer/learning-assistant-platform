from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.deps import require_current_user
from app.db.session import get_db
from app.models.entities import Course, QuizAttempt, QuizQuestion, User
from app.schemas.workspace import QuizAttemptsIn, QuizAttemptsOut

router = APIRouter(prefix="/quiz", tags=["quiz"])

TRUE_ALIASES = {"true", "正确", "对", "yes", "t"}
FALSE_ALIASES = {"false", "错误", "错", "no", "f"}


def _normalize(value: str) -> str:
    return value.strip().lower()


def _is_correct(question: QuizQuestion, chosen: str) -> bool:
    """服务端判分,不信任客户端提交的 correct 字段。"""
    expected = _normalize(question.answer)
    given = _normalize(chosen)
    if not expected or not given:
        return False
    if expected == given:
        return True
    if expected in TRUE_ALIASES and given in TRUE_ALIASES:
        return True
    if expected in FALSE_ALIASES and given in FALSE_ALIASES:
        return True
    # 兼容答案为选项字母(如 "A")而选项为完整文本的情况
    if len(expected) == 1 and expected.isalpha():
        option_index = ord(expected) - ord("a")
        options = question.options or []
        if 0 <= option_index < len(options) and _normalize(options[option_index]) == given:
            return True
    return False


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
                correct=_is_correct(question, item.chosen),
            )
        )
        recorded += 1
    db.commit()
    return QuizAttemptsOut(recorded=recorded)
