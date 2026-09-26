import logging
from pathlib import Path

from fastapi import APIRouter, Body, Depends, HTTPException, status
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.deps import require_current_user
from app.db.session import get_db
from app.exporters.anki import render_anki_tsv
from app.exporters.json_export import render_course_json
from app.exporters.markdown import render_course_markdown
from app.exporters.study_report import build_study_report
from app.models.entities import Chapter, Course, Export, Note, Organization, ReviewCard, TranscriptSegment, User
from app.schemas.workspace import ExportCreateIn, ExportItem, ExportListOut
from app.services.plugins import ensure_default_organization
from app.services.video_sources import latest_video_events_by_chapter, video_export_info

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/exports", tags=["exports"])


def export_dir_path() -> Path:
    configured = Path(get_settings().export_dir)
    directory = configured if configured.is_absolute() else Path(__file__).resolve().parents[2] / configured
    directory.mkdir(parents=True, exist_ok=True)
    return directory


def course_export_payload(db: Session, course: Course | None) -> dict:
    if not course:
        return {"title": "Workspace Export", "chapters": []}
    chapters = db.query(Chapter).filter(Chapter.course_id == course.id).order_by(Chapter.sort_order.asc(), Chapter.title.asc()).all()
    video_events = latest_video_events_by_chapter(db, course)
    return {
        "title": course.title,
        "chapters": [
            {
                "title": chapter.title,
                "video": video_export_info(video_events[chapter.external_chapter_id]) if chapter.external_chapter_id in video_events else None,
                "transcripts": [
                    {
                        "start_seconds": float(segment.start_seconds) if segment.start_seconds is not None else None,
                        "text": segment.text,
                    }
                    for segment in db.query(TranscriptSegment)
                    .filter(TranscriptSegment.chapter_id == chapter.id)
                    .order_by(TranscriptSegment.start_seconds.asc())
                    .all()
                ],
                "notes": [
                    {
                        "video_time_seconds": float(note.video_time_seconds) if note.video_time_seconds is not None else None,
                        "content": note.content,
                        "corrected_content": note.corrected_content,
                        "tags": list(note.tags or []),
                    }
                    for note in db.query(Note).filter(Note.chapter_id == chapter.id).order_by(Note.created_at.asc()).all()
                ],
            }
            for chapter in chapters
        ],
    }


@router.post("")
def create_export(
    payload: ExportCreateIn | None = Body(default=None),
    user: User = Depends(require_current_user),
    db: Session = Depends(get_db),
) -> dict[str, str]:
    requested = payload or ExportCreateIn()
    export_format = requested.export_format
    if export_format not in {"markdown", "json", "anki", "report_pdf"}:
        raise HTTPException(status_code=400, detail="Unsupported export format")
    course = db.query(Course).filter(Course.id == requested.course_id).first() if requested.course_id else None
    if requested.course_id and not course:
        raise HTTPException(status_code=404, detail="Course not found")
    organization_id = course.organization_id if course else ensure_default_organization(db).id
    export = Export(
        organization_id=organization_id,
        user_id=user.id,
        course_id=requested.course_id,
        format=export_format,
        status="queued",
        file_path=None,
    )
    db.add(export)
    db.flush()
    try:
        if export_format == "report_pdf":
            organization = db.get(Organization, organization_id)
            content = build_study_report(db, organization, user, course)
            scope = course.id if course else "all"
            # 文件名用 export.id 保证唯一,避免同秒同范围导出互相覆盖
            path = export_dir_path() / f"study-report-{scope}-{export.id}.pdf"
            path.write_bytes(content)
        elif export_format == "anki":
            if not course:
                raise HTTPException(status_code=400, detail="Anki export requires a course")
            cards = db.query(ReviewCard).filter(ReviewCard.course_id == course.id).order_by(ReviewCard.created_at.asc()).all()
            if cards:
                rows = [{"front": card.front, "back": card.back} for card in cards]
            else:
                notes = db.query(Note).filter(Note.course_id == course.id).order_by(Note.created_at.asc()).all()
                rows = [{"front": note.content, "back": ""} for note in notes]
            content = render_anki_tsv(rows)
            path = export_dir_path() / f"{export.id}.tsv"
            path.write_text(content, encoding="utf-8", newline="")
        else:
            document = course_export_payload(db, course)
            content = render_course_markdown(document) if export_format == "markdown" else render_course_json(document)
            suffix = ".md" if export_format == "markdown" else ".json"
            path = export_dir_path() / f"{export.id}{suffix}"
            path.write_text(content, encoding="utf-8", newline="")
        export.file_path = str(path)
        export.status = "completed"
    except HTTPException:
        export.status = "failed"
        db.commit()
        raise
    except Exception as exc:
        export.status = "failed"
        db.commit()
        logger.exception("export %s failed", export.id)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="导出失败") from exc
    db.commit()
    db.refresh(export)
    return {"id": export.id, "status": export.status, "format": export.format}


@router.get("", response_model=ExportListOut)
def list_exports(_: User = Depends(require_current_user), db: Session = Depends(get_db)) -> ExportListOut:
    exports = db.query(Export).order_by(Export.created_at.desc()).limit(200).all()
    items: list[ExportItem] = []
    for export in exports:
        course = db.query(Course).filter(Course.id == export.course_id).first() if export.course_id else None
        items.append(
            ExportItem(
                id=export.id,
                course_id=export.course_id,
                course_title=course.title if course else None,
                format=export.format,
                status=export.status,
                file_path=export.file_path,
                created_at=export.created_at,
            )
        )
    return ExportListOut(items=items)


@router.get("/{export_id}/download")
def download_export(export_id: str, _: User = Depends(require_current_user), db: Session = Depends(get_db)) -> FileResponse:
    export = db.query(Export).filter(Export.id == export_id).first()
    if not export or not export.file_path:
        raise HTTPException(status_code=404, detail="Export not found")
    path = Path(export.file_path)
    if not path.is_file():
        raise HTTPException(status_code=404, detail="Export file not found")
    media_type = {"json": "application/json", "anki": "text/tab-separated-values", "report_pdf": "application/pdf"}.get(export.format, "text/markdown")
    return FileResponse(path, media_type=media_type, filename=path.name)
