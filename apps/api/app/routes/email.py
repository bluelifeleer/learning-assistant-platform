from html import escape

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.deps import require_current_user
from app.db.session import get_db
from app.exporters.markdown import format_time
from app.models.entities import Chapter, Course, Note, Organization, TranscriptSegment, User
from app.schemas.ai import AiTaskCreatedOut
from app.schemas.workspace import EmailActionOut, EmailSettingsOut, EmailSettingsUpdateIn
from app.services import ai_tasks, emailer
from app.services.plugins import ensure_default_organization
from app.routes.review import CONTEXT_WINDOW_SECONDS

router = APIRouter(prefix="/email", tags=["email"])

VALID_DIGEST_FREQUENCIES = {"daily", "weekly"}


def settings_out(db: Session) -> EmailSettingsOut:
    organization = ensure_default_organization(db)
    configured = bool(
        organization.smtp_host and organization.smtp_username and organization.smtp_password and organization.email_to
    )
    return EmailSettingsOut(
        smtp_host=organization.smtp_host,
        smtp_port=organization.smtp_port or 465,
        smtp_username=organization.smtp_username,
        password_masked=emailer.mask_password(organization.smtp_password),
        email_from=organization.email_from,
        email_to=organization.email_to,
        configured=configured,
        digest_auto=bool(organization.digest_auto),
        digest_frequency=organization.digest_frequency or "daily",
        digest_hour=organization.digest_hour if organization.digest_hour is not None else 8,
        last_digest_at=organization.last_digest_at,
    )


def org_email_config(organization: Organization):
    try:
        return emailer.email_config_for_organization(organization)
    except emailer.EmailNotConfiguredError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from None


@router.get("/settings", response_model=EmailSettingsOut)
def read_email_settings(_: User = Depends(require_current_user), db: Session = Depends(get_db)) -> EmailSettingsOut:
    return settings_out(db)


@router.put("/settings", response_model=EmailSettingsOut)
def update_email_settings(
    payload: EmailSettingsUpdateIn, _: User = Depends(require_current_user), db: Session = Depends(get_db)
) -> EmailSettingsOut:
    organization = ensure_default_organization(db)
    if payload.smtp_host is not None:
        organization.smtp_host = payload.smtp_host or None
    if payload.smtp_port is not None:
        organization.smtp_port = payload.smtp_port
    if payload.smtp_username is not None:
        organization.smtp_username = payload.smtp_username or None
    if payload.smtp_password is not None:
        # 不传 = 不修改;传空串 = 清除
        organization.smtp_password = payload.smtp_password or None
    if payload.email_from is not None:
        organization.email_from = payload.email_from or None
    if payload.email_to is not None:
        organization.email_to = payload.email_to or None
    if payload.digest_auto is not None:
        organization.digest_auto = payload.digest_auto
    if payload.digest_frequency is not None:
        if payload.digest_frequency not in VALID_DIGEST_FREQUENCIES:
            raise HTTPException(status_code=422, detail="digest_frequency 只能为 daily 或 weekly")
        organization.digest_frequency = payload.digest_frequency
    if payload.digest_hour is not None:
        organization.digest_hour = payload.digest_hour
    db.commit()
    return settings_out(db)


@router.post("/settings/test", response_model=EmailActionOut)
def test_email_settings(_: User = Depends(require_current_user), db: Session = Depends(get_db)) -> EmailActionOut:
    organization = ensure_default_organization(db)
    config = org_email_config(organization)
    try:
        emailer.send_email(
            config,
            config.email_to,
            "学习助手邮箱测试",
            "<html><body><p>这是一封来自学习助手的测试邮件,SMTP 配置已生效。</p></body></html>",
            "这是一封来自学习助手的测试邮件,SMTP 配置已生效。",
        )
    except Exception as exc:
        return EmailActionOut(ok=False, detail=str(exc)[:500])
    return EmailActionOut(ok=True, detail=None)


@router.post("/notes/{note_id}/send", response_model=EmailActionOut)
def send_note_email(note_id: str, _: User = Depends(require_current_user), db: Session = Depends(get_db)) -> EmailActionOut:
    note = db.get(Note, note_id)
    if not note:
        raise HTTPException(status_code=404, detail="Note not found")
    course = db.get(Course, note.course_id)
    chapter = db.get(Chapter, note.chapter_id) if note.chapter_id else None
    organization = db.get(Organization, course.organization_id) if course else ensure_default_organization(db)
    config = org_email_config(organization)
    note_content = note.corrected_content or note.content
    context_text = ""
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
        context_text = "\n".join(segment.text for segment in segments)
    time_text = format_time(note.video_time_seconds)
    subject = f"学习笔记:{course.title if course else '未知课程'}"
    text_lines = [
        f"课程:{course.title if course else '未知'}",
        f"章节:{chapter.title if chapter else '未知'}",
        f"视频时间点:{time_text}",
        "",
        "笔记内容:",
        note_content,
    ]
    if context_text:
        text_lines.extend(["", f"字幕上下文(±{CONTEXT_WINDOW_SECONDS} 秒):", context_text])
    text_body = "\n".join(text_lines)
    context_html = (
        f"<h4>字幕上下文(±{CONTEXT_WINDOW_SECONDS} 秒)</h4><p>{escape(context_text).replace(chr(10), '<br>')}</p>" if context_text else ""
    )
    html_body = (
        "<html><body>"
        f"<p>课程:{escape(course.title if course else '未知')}<br>"
        f"章节:{escape(chapter.title if chapter else '未知')}<br>"
        f"视频时间点:{time_text}</p>"
        f"<h4>笔记内容</h4><p>{escape(note_content).replace(chr(10), '<br>')}</p>"
        f"{context_html}"
        "</body></html>"
    )
    try:
        emailer.send_email(config, config.email_to, subject, html_body, text_body)
    except Exception as exc:
        return EmailActionOut(ok=False, detail=str(exc)[:500])
    return EmailActionOut(ok=True, detail=None)


@router.post("/digest/send", response_model=AiTaskCreatedOut)
def send_digest_email(
    background_tasks: BackgroundTasks,
    _: User = Depends(require_current_user),
    db: Session = Depends(get_db),
) -> AiTaskCreatedOut:
    organization = ensure_default_organization(db)
    org_email_config(organization)
    task, created = ai_tasks.create_task(db, organization.id, ai_tasks.TASK_EMAIL_DIGEST, None)
    if created:
        background_tasks.add_task(ai_tasks.run_ai_task, task.id)
    return AiTaskCreatedOut(task_id=task.id, status=task.status)
