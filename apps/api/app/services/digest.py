from datetime import datetime, timedelta
from html import escape

from sqlalchemy import Integer, cast, func
from sqlalchemy.orm import Session

from app.models.entities import (
    ChapterSummary,
    Course,
    Membership,
    Note,
    Organization,
    QuizAttempt,
    ReviewCard,
    ReviewLog,
    User,
    VideoSession,
)
from app.services import ai_prompts, llm
from app.services.emailer import email_config_for_organization, send_email

DAILY_WINDOW = timedelta(hours=24)
WEEKLY_WINDOW = timedelta(days=7)
KEY_POINT_LIMIT = 20


def digest_window(organization: Organization) -> timedelta:
    return WEEKLY_WINDOW if organization.digest_frequency == "weekly" else DAILY_WINDOW


def digest_is_due(organization: Organization, now: datetime) -> bool:
    """纯函数:按服务器本地时间判断组织的自动学习总结是否到期。"""
    if not organization.digest_auto:
        return False
    digest_hour = organization.digest_hour if organization.digest_hour is not None else 8
    last = organization.last_digest_at
    if organization.digest_frequency == "weekly":
        # 每周一 digest_hour 点之后,且 7 天内未发送过
        if now.weekday() != 0 or now.hour < digest_hour:
            return False
        return last is None or (now - last) >= WEEKLY_WINDOW
    # 每天 digest_hour 点之后,且当天未发送过
    if now.hour < digest_hour:
        return False
    return last is None or last.date() < now.date()


def _count_since(db: Session, model, column, since: datetime) -> int:
    return db.query(func.count(model.id)).filter(column >= since).scalar() or 0


def collect_digest_stats(db: Session, organization: Organization, since: datetime, now: datetime) -> dict:
    notes_count = _count_since(db, Note, Note.created_at, since)
    watch_seconds = int(
        db.query(func.coalesce(func.sum(VideoSession.duration_watched_seconds), 0)).filter(VideoSession.started_at >= since).scalar() or 0
    )
    review_count = _count_since(db, ReviewLog, ReviewLog.reviewed_at, since)
    attempt_row = (
        db.query(func.count(QuizAttempt.id), func.coalesce(func.sum(cast(QuizAttempt.correct, Integer)), 0))
        .filter(QuizAttempt.organization_id == organization.id, QuizAttempt.created_at >= since)
        .first()
    )
    quiz_total = int(attempt_row[0] or 0)
    quiz_correct = int(attempt_row[1] or 0)
    due_cards = db.query(func.count(ReviewCard.id)).filter(ReviewCard.due_at <= now).scalar() or 0
    active_course_ids = {
        row[0] for row in db.query(Note.course_id).filter(Note.created_at >= since).distinct().all()
    } | {row[0] for row in db.query(VideoSession.course_id).filter(VideoSession.started_at >= since).distinct().all()}
    key_points: list[str] = []
    if active_course_ids:
        summaries = (
            db.query(ChapterSummary)
            .filter(ChapterSummary.course_id.in_(active_course_ids), ChapterSummary.status == "done")
            .order_by(ChapterSummary.created_at.asc())
            .all()
        )
        for summary in summaries:
            key_points.extend(str(point) for point in (summary.key_points or []))
    return {
        "notes_count": notes_count,
        "watch_seconds": watch_seconds,
        "review_count": review_count,
        "quiz_total": quiz_total,
        "quiz_correct": quiz_correct,
        "quiz_accuracy": round(quiz_correct / quiz_total * 100, 1) if quiz_total else None,
        "due_cards": due_cards,
        "active_courses": [title for (title,) in db.query(Course.title).filter(Course.id.in_(active_course_ids)).all()]
        if active_course_ids
        else [],
        "key_points": key_points[:KEY_POINT_LIMIT],
    }


def _stats_text(stats: dict) -> str:
    accuracy = f"{stats['quiz_accuracy']:.1f}%" if stats["quiz_accuracy"] is not None else "暂无"
    return (
        f"新增笔记 {stats['notes_count']} 条;"
        f"学习时长 {stats['watch_seconds'] // 60} 分钟;"
        f"复习 {stats['review_count']} 次;"
        f"测验答题 {stats['quiz_total']} 题,正确率 {accuracy};"
        f"当前到期卡片 {stats['due_cards']} 张"
    )


def build_digest(db: Session, organization: Organization, user: User | None, since: datetime) -> tuple[str, str, str]:
    now = datetime.now()
    stats = collect_digest_stats(db, organization, since, now)
    stats_text = _stats_text(stats)
    subject = f"学习总结 {since:%Y-%m-%d} ~ {now:%Y-%m-%d}"
    llm_summary: str | None = None
    try:
        llm_config = llm.llm_config_for_organization(organization)
    except llm.LLMNotConfiguredError:
        llm_config = None
    if llm_config:
        try:
            llm_summary = llm.chat_completion(llm_config, ai_prompts.digest_messages(stats_text, stats["key_points"]), json_mode=False).strip()
        except llm.LLMRequestError:
            llm_summary = None
    if not llm_summary:
        points_preview = "、".join(stats["key_points"][:5]) or "坚持记录笔记,逐步积累学习重点"
        llm_summary = f"本周期{stats_text}。近期学习重点:{points_preview}。继续保持!"
    greeting = f"{user.display_name},你好!" if user else "你好!"
    courses_text = "、".join(stats["active_courses"]) or "暂无活跃课程"
    text_lines = [
        greeting,
        "",
        f"统计区间:{since:%Y-%m-%d %H:%M} ~ {now:%Y-%m-%d %H:%M}",
        f"涉及课程:{courses_text}",
        stats_text,
        "",
        "学习重点总结:",
        llm_summary,
    ]
    text_body = "\n".join(text_lines)
    html_body = (
        "<html><body>"
        f"<p>{escape(greeting)}</p>"
        f"<p>统计区间:{since:%Y-%m-%d %H:%M} ~ {now:%Y-%m-%d %H:%M}<br>"
        f"涉及课程:{escape(courses_text)}<br>{escape(stats_text)}</p>"
        "<h3>学习重点总结</h3>"
        f"<p>{escape(llm_summary).replace(chr(10), '<br>')}</p>"
        "</body></html>"
    )
    return subject, html_body, text_body


def send_digest(db: Session, organization: Organization) -> None:
    """组织级聚合数据,发一封到 email_to,成功后更新 last_digest_at。"""
    config = email_config_for_organization(organization)
    user = (
        db.query(User)
        .join(Membership, Membership.user_id == User.id)
        .filter(Membership.organization_id == organization.id)
        .order_by(Membership.role.asc(), User.created_at.asc())
        .first()
    ) or db.query(User).order_by(User.created_at.asc()).first()
    now = datetime.now()
    subject, html_body, text_body = build_digest(db, organization, user, now - digest_window(organization))
    send_email(config, config.email_to, subject, html_body, text_body)
    organization.last_digest_at = now
    db.commit()
