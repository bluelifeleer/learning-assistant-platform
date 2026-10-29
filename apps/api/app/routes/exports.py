import logging
from pathlib import Path

from fastapi import APIRouter, Body, Depends, HTTPException, Response, status
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.deps import require_current_user, require_owner
from app.db.session import get_db
from app.exporters.anki import render_anki_tsv
from app.exporters.json_export import render_course_json
from app.exporters.markdown import render_course_markdown
from app.exporters.package import write_package
from app.exporters.study_report import build_study_report
from app.models.entities import Course, Export, Membership, Note, Organization, ReviewCard, User
from app.schemas.workspace import ExportCreateIn, ExportItem, ExportListOut
from app.services.export_payload import APP_VERSION, build_export_bundle, markdown_document
from app.services.export_cleanup import cleanup_exports as run_export_cleanup
from app.services.plugins import ensure_default_organization

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/exports", tags=["exports"])

SUPPORTED_FORMATS = {"markdown", "json", "anki", "report_pdf", "package"}
#: 这些格式的产物只描述一门课程，多选课程无从表达
SINGLE_COURSE_FORMATS = {"markdown", "json", "anki"}

DOWNLOAD_MEDIA_TYPES = {
    "json": "application/json",
    "anki": "text/tab-separated-values",
    "report_pdf": "application/pdf",
    "package": "application/zip",
}


def export_dir_path() -> Path:
    configured = Path(get_settings().export_dir)
    directory = configured if configured.is_absolute() else Path(__file__).resolve().parents[2] / configured
    directory.mkdir(parents=True, exist_ok=True)
    return directory


def organization_for_user(db: Session, user: User) -> Organization:
    """当前用户所属组织；没有成员关系时退回默认组织。

    导出/导入必须以组织为边界，否则多组织部署下会互相看到对方的文件。
    """
    membership = db.query(Membership).filter(Membership.user_id == user.id).first()
    if membership:
        organization = db.get(Organization, membership.organization_id)
        if organization:
            return organization
    return ensure_default_organization(db)


def _resolve_courses(db: Session, organization: Organization, requested: ExportCreateIn) -> list[Course]:
    if requested.course_ids:
        wanted = list(dict.fromkeys(requested.course_ids))
        found = {
            course.id: course
            for course in db.query(Course)
            .filter(Course.organization_id == organization.id, Course.id.in_(wanted))
            .all()
        }
        missing = [course_id for course_id in wanted if course_id not in found]
        if missing:
            raise HTTPException(status_code=404, detail=f"Course not found: {missing[0]}")
        return [found[course_id] for course_id in wanted]
    if requested.course_id:
        course = (
            db.query(Course)
            .filter(Course.id == requested.course_id, Course.organization_id == organization.id)
            .first()
        )
        if not course:
            raise HTTPException(status_code=404, detail="Course not found")
        return [course]
    # 不指定课程 = 全部课程（仅包格式与学习档案 PDF 支持）
    return (
        db.query(Course)
        .filter(Course.organization_id == organization.id)
        .order_by(Course.title.asc(), Course.id.asc())
        .all()
    )


def _anki_rows(db: Session, course: Course) -> list[dict]:
    cards = db.query(ReviewCard).filter(ReviewCard.course_id == course.id).order_by(ReviewCard.created_at.asc()).all()
    if cards:
        return [{"front": card.front, "back": card.back} for card in cards]
    notes = db.query(Note).filter(Note.course_id == course.id).order_by(Note.created_at.asc()).all()
    return [{"front": note.content, "back": ""} for note in notes]


@router.post("")
def create_export(
    payload: ExportCreateIn | None = Body(default=None),
    user: User = Depends(require_current_user),
    db: Session = Depends(get_db),
) -> dict[str, str]:
    requested = payload or ExportCreateIn()
    export_format = requested.export_format
    if export_format not in SUPPORTED_FORMATS:
        raise HTTPException(status_code=400, detail="Unsupported export format")

    organization = organization_for_user(db, user)
    courses = _resolve_courses(db, organization, requested)
    # 没有指定课程 = 全部课程：仅 package / report_pdf 支持这种范围
    explicit_selection = bool(requested.course_id or requested.course_ids)

    if export_format in SINGLE_COURSE_FORMATS and len(courses) != 1:
        raise HTTPException(status_code=400, detail="该格式一次只能导出一门课程")
    if export_format == "report_pdf" and requested.course_ids and len(courses) > 1:
        raise HTTPException(status_code=400, detail="学习档案 PDF 一次只能导出一门课程")
    if export_format == "package" and not courses:
        raise HTTPException(status_code=400, detail="没有可导出的课程")

    export = Export(
        organization_id=organization.id,
        user_id=user.id,
        # 只导一门课时保留课程关联，方便列表展示课程名
        course_id=courses[0].id if len(courses) == 1 else None,
        format=export_format,
        status="queued",
        progress=0,
        file_path=None,
    )
    db.add(export)
    db.flush()

    scope_counts: dict = {}
    try:
        if export_format == "report_pdf":
            # 未指定课程 = 全部课程的汇总档案（沿用原有语义）
            target = courses[0] if explicit_selection and courses else None
            content = build_study_report(db, organization, user, target)
            scope = target.id if target else "all"
            # 文件名用 export.id 保证唯一,避免同秒同范围导出互相覆盖
            path = export_dir_path() / f"study-report-{scope}-{export.id}.pdf"
            path.write_bytes(content)
        elif export_format == "anki":
            content = render_anki_tsv(_anki_rows(db, courses[0]))
            path = export_dir_path() / f"{export.id}.tsv"
            path.write_text(content, encoding="utf-8", newline="")
        elif export_format == "package":
            bundle = build_export_bundle(db, organization, courses, include_media=requested.include_media)
            path = export_dir_path() / f"{export.id}.lapkg"
            scope_counts = write_package(path, bundle, app_version=APP_VERSION)
        else:
            # markdown / json 保持精简输出，不含媒体
            bundle = build_export_bundle(db, organization, courses, include_media=False)
            document = markdown_document(bundle)
            content = render_course_markdown(document) if export_format == "markdown" else render_course_json(document)
            suffix = ".md" if export_format == "markdown" else ".json"
            path = export_dir_path() / f"{export.id}{suffix}"
            path.write_text(content, encoding="utf-8", newline="")

        export.file_path = str(path)
        export.size_bytes = path.stat().st_size if path.is_file() else None
        export.scope_counts = scope_counts
        export.progress = 100
        export.status = "completed"
    except HTTPException:
        export.status = "failed"
        export.error = "unsupported export request"
        db.commit()
        raise
    except Exception as exc:
        export.status = "failed"
        export.error = str(exc)[:1000]
        db.commit()
        logger.exception("export %s failed", export.id)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="导出失败") from exc
    db.commit()
    db.refresh(export)
    return {"id": export.id, "status": export.status, "format": export.format}


def _export_item(export: Export, course_titles: dict[str, str]) -> ExportItem:
    return ExportItem(
        id=export.id,
        course_id=export.course_id,
        course_title=course_titles.get(export.course_id) if export.course_id else None,
        format=export.format,
        status=export.status,
        file_path=export.file_path,
        progress=export.progress or 0,
        error=export.error,
        size_bytes=export.size_bytes,
        scope_counts=export.scope_counts or None,
        created_at=export.created_at,
    )


@router.get("", response_model=ExportListOut)
def list_exports(user: User = Depends(require_current_user), db: Session = Depends(get_db)) -> ExportListOut:
    organization = organization_for_user(db, user)
    exports = (
        db.query(Export)
        .filter(Export.organization_id == organization.id)
        .order_by(Export.created_at.desc())
        .limit(200)
        .all()
    )
    # 批量取课程标题,避免每行一次查询
    course_ids = {row.course_id for row in exports if row.course_id}
    course_titles = (
        {row.id: row.title for row in db.query(Course.id, Course.title).filter(Course.id.in_(course_ids)).all()}
        if course_ids
        else {}
    )
    return ExportListOut(items=[_export_item(export, course_titles) for export in exports])


@router.get("/{export_id}", response_model=ExportItem)
def read_export(export_id: str, user: User = Depends(require_current_user), db: Session = Depends(get_db)) -> ExportItem:
    organization = organization_for_user(db, user)
    export = db.query(Export).filter(Export.id == export_id, Export.organization_id == organization.id).first()
    if not export:
        raise HTTPException(status_code=404, detail="Export not found")
    course = db.get(Course, export.course_id) if export.course_id else None
    return _export_item(export, {course.id: course.title} if course else {})


@router.post("/cleanup")
def cleanup_exports_now(
    keep_days: int | None = None,
    keep_count: int | None = None,
    user: User = Depends(require_owner),
    db: Session = Depends(get_db),
) -> dict[str, int]:
    """手动触发导出清理（按当前组织的保留策略，或显式传入阈值）。"""
    settings = get_settings()
    organization = organization_for_user(db, user)
    days = settings.export_retention_days if keep_days is None else keep_days
    count = settings.export_retention_count if keep_count is None else keep_count
    if days < 0 or count < 0:
        raise HTTPException(status_code=400, detail="保留天数与份数不能为负")
    return run_export_cleanup(db, keep_days=days, keep_count=count, organization_id=organization.id)


@router.delete("/{export_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_export(
    export_id: str,
    user: User = Depends(require_current_user),
    db: Session = Depends(get_db),
) -> Response:
    """删除导出记录及其文件（导出中心用）。"""
    organization = organization_for_user(db, user)
    export = db.query(Export).filter(Export.id == export_id, Export.organization_id == organization.id).first()
    if not export:
        raise HTTPException(status_code=404, detail="Export not found")
    if export.file_path:
        path = Path(export.file_path)
        try:
            path.unlink(missing_ok=True)
        except OSError:
            logger.warning("删除导出文件失败: %s", path, exc_info=True)
    db.delete(export)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/{export_id}/download")
def download_export(
    export_id: str,
    user: User = Depends(require_current_user),
    db: Session = Depends(get_db),
) -> FileResponse:
    organization = organization_for_user(db, user)
    export = (
        db.query(Export)
        .filter(Export.id == export_id, Export.organization_id == organization.id)
        .first()
    )
    if not export or not export.file_path:
        raise HTTPException(status_code=404, detail="Export not found")
    path = Path(export.file_path)
    if not path.is_file():
        raise HTTPException(status_code=404, detail="Export file not found")
    media_type = DOWNLOAD_MEDIA_TYPES.get(export.format, "text/markdown")
    return FileResponse(path, media_type=media_type, filename=path.name)
