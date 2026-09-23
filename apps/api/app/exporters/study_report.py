from datetime import datetime
from io import BytesIO

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.cidfonts import UnicodeCIDFont
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle
from sqlalchemy import Integer, cast, func
from sqlalchemy.orm import Session

from app.models.entities import Chapter, ChapterSummary, Course, Note, Organization, QuizAttempt, Screenshot, User, VideoSession

FONT_NAME = "STSong-Light"
_font_registered = False


def ensure_font() -> None:
    global _font_registered
    if not _font_registered:
        pdfmetrics.registerFont(UnicodeCIDFont(FONT_NAME))
        _font_registered = True


def format_duration(seconds: int | float | None) -> str:
    total = int(seconds or 0)
    hours, remainder = divmod(total, 3600)
    minutes = remainder // 60
    if hours:
        return f"{hours}小时{minutes}分钟"
    if minutes:
        return f"{minutes}分钟"
    return f"{total}秒"


def _styles() -> dict[str, ParagraphStyle]:
    ensure_font()
    return {
        "title": ParagraphStyle("title", fontName=FONT_NAME, fontSize=20, leading=28, spaceAfter=10),
        "meta": ParagraphStyle("meta", fontName=FONT_NAME, fontSize=10, leading=16, textColor=colors.HexColor("#444444")),
        "h1": ParagraphStyle("h1", fontName=FONT_NAME, fontSize=15, leading=22, spaceBefore=14, spaceAfter=6),
        "h2": ParagraphStyle("h2", fontName=FONT_NAME, fontSize=12, leading=18, spaceBefore=8, spaceAfter=4),
        "body": ParagraphStyle("body", fontName=FONT_NAME, fontSize=10, leading=16),
        "point": ParagraphStyle("point", fontName=FONT_NAME, fontSize=10, leading=16, leftIndent=10),
    }


def _course_report_data(db: Session, user: User, course: Course) -> dict:
    chapters = db.query(Chapter).filter(Chapter.course_id == course.id).order_by(Chapter.sort_order.asc(), Chapter.title.asc()).all()
    durations = dict(
        db.query(VideoSession.chapter_id, func.coalesce(func.sum(VideoSession.duration_watched_seconds), 0))
        .filter(VideoSession.course_id == course.id, VideoSession.user_id == user.id)
        .group_by(VideoSession.chapter_id)
        .all()
    )
    note_count = db.query(func.count(Note.id)).filter(Note.course_id == course.id, Note.user_id == user.id).scalar() or 0
    screenshot_count = (
        db.query(func.count(Screenshot.id)).filter(Screenshot.course_id == course.id, Screenshot.user_id == user.id).scalar() or 0
    )
    attempt_row = (
        db.query(func.count(QuizAttempt.id), func.coalesce(func.sum(cast(QuizAttempt.correct, Integer)), 0))
        .filter(QuizAttempt.course_id == course.id, QuizAttempt.user_id == user.id)
        .first()
    )
    quiz_total = int(attempt_row[0] or 0)
    quiz_correct = int(attempt_row[1] or 0)
    quiz_accuracy = round(quiz_correct / quiz_total * 100, 1) if quiz_total else None
    summaries = (
        db.query(ChapterSummary)
        .filter(ChapterSummary.course_id == course.id, ChapterSummary.status == "done")
        .order_by(ChapterSummary.created_at.asc())
        .all()
    )
    key_points: list[str] = []
    for summary in summaries:
        key_points.extend(str(point) for point in (summary.key_points or []))
    has_activity = bool(note_count or screenshot_count or quiz_total or any(int(value or 0) for value in durations.values()))
    return {
        "course": course,
        "chapters": chapters,
        "durations": durations,
        "note_count": note_count,
        "screenshot_count": screenshot_count,
        "quiz_total": quiz_total,
        "quiz_correct": quiz_correct,
        "quiz_accuracy": quiz_accuracy,
        "key_points": key_points,
        "has_activity": has_activity,
    }


def build_study_report(db: Session, organization: Organization, user: User, course: Course | None = None) -> bytes:
    styles = _styles()
    if course:
        courses = [course]
        scope_text = f"课程:{course.title}"
    else:
        courses = db.query(Course).filter(Course.organization_id == organization.id).order_by(Course.created_at.asc()).all()
        scope_text = "全部课程"
    story: list = [Paragraph("学习档案", styles["title"])]
    generated_at = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    for line in (
        f"组织:{organization.name}",
        f"用户:{user.display_name}",
        f"生成时间:{generated_at}",
        f"统计区间:{scope_text}(全部历史记录)",
    ):
        story.append(Paragraph(line, styles["meta"]))
    story.append(Spacer(1, 6 * mm))
    if not courses:
        story.append(Paragraph("暂无课程数据。", styles["body"]))
    for item in (_course_report_data(db, user, entry) for entry in courses):
        story.append(Paragraph(f"课程:{item['course'].title}", styles["h1"]))
        if not item["has_activity"]:
            story.append(Paragraph("暂无学习记录", styles["body"]))
            story.append(Spacer(1, 3 * mm))
            continue
        rows = [["章节", "学习时长"]]
        for chapter in item["chapters"]:
            rows.append([chapter.title, format_duration(item["durations"].get(chapter.id, 0))])
        if len(rows) > 1:
            table = Table(rows, colWidths=[110 * mm, 50 * mm])
            table.setStyle(
                TableStyle(
                    [
                        ("FONTNAME", (0, 0), (-1, -1), FONT_NAME),
                        ("FONTSIZE", (0, 0), (-1, -1), 9),
                        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#f0f0f0")),
                        ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#cccccc")),
                        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                    ]
                )
            )
            story.append(table)
            story.append(Spacer(1, 2 * mm))
        accuracy_text = f"{item['quiz_accuracy']:.1f}%" if item["quiz_accuracy"] is not None else "暂无测验记录"
        story.append(
            Paragraph(
                f"笔记数:{item['note_count']}  截图数:{item['screenshot_count']}  "
                f"测验正确率:{accuracy_text}(答对 {item['quiz_correct']}/{item['quiz_total']} 题)",
                styles["body"],
            )
        )
        if item["key_points"]:
            story.append(Paragraph("学习重点", styles["h2"]))
            for point in item["key_points"]:
                story.append(Paragraph(f"• {point}", styles["point"]))
        story.append(Spacer(1, 3 * mm))
    buffer = BytesIO()
    document = SimpleDocTemplate(buffer, pagesize=A4, title="学习档案", leftMargin=20 * mm, rightMargin=20 * mm)
    document.build(story)
    return buffer.getvalue()
