from fastapi import APIRouter, Body, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.deps import require_bearer_token
from app.db.session import get_db
from app.exporters.json_export import render_course_json
from app.exporters.markdown import render_course_markdown
from app.models.entities import Course, Export
from app.schemas.workspace import ExportCreateIn, ExportItem, ExportListOut
from app.services.auth import AuthService
from app.services.plugins import ensure_default_organization

router = APIRouter(prefix="/exports", tags=["exports"])


@router.post("")
def create_export(
    payload: ExportCreateIn | None = Body(default=None),
    format: str = "markdown",
    token: str | None = Depends(require_bearer_token),
    db: Session = Depends(get_db),
) -> dict[str, str]:
    requested = payload or ExportCreateIn(format=format)
    format = requested.format
    if format not in {"markdown", "json"}:
        raise HTTPException(status_code=400, detail="Unsupported export format")
    user = AuthService(db).current_user(token) if token else None
    course = db.query(Course).filter(Course.id == requested.course_id).first() if requested.course_id else None
    organization_id = course.organization_id if course else ensure_default_organization(db).id
    export = Export(
        organization_id=organization_id,
        user_id=user.id if user else None,
        course_id=requested.course_id,
        format=format,
        status="queued",
        file_path=None,
    )
    db.add(export)
    db.commit()
    db.refresh(export)
    return {"id": export.id, "status": export.status, "format": export.format}


@router.get("", response_model=ExportListOut)
def list_exports(db: Session = Depends(get_db)) -> ExportListOut:
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


def render_export(course: dict, format: str) -> str:
    if format == "markdown":
        return render_course_markdown(course)
    if format == "json":
        return render_course_json(course)
    raise ValueError(f"Unsupported export format: {format}")
