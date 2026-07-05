from fastapi import APIRouter, HTTPException

from app.exporters.json_export import render_course_json
from app.exporters.markdown import render_course_markdown

router = APIRouter(prefix="/exports", tags=["exports"])


@router.post("")
def create_export(format: str = "markdown") -> dict[str, str]:
    if format not in {"markdown", "json"}:
        raise HTTPException(status_code=400, detail="Unsupported export format")
    return {"status": "queued", "format": format}


def render_export(course: dict, format: str) -> str:
    if format == "markdown":
        return render_course_markdown(course)
    if format == "json":
        return render_course_json(course)
    raise ValueError(f"Unsupported export format: {format}")
