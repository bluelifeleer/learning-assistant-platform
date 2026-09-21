from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.core.deps import require_current_user
from app.db.session import get_db
from app.models.entities import Chapter, Course, Screenshot, User
from app.schemas.workspace import ScreenshotImageUpdateIn, ScreenshotItem, ScreenshotListOut
from app.services.capture import decode_base64_image

router = APIRouter(prefix="/screenshots", tags=["screenshots"])


@router.get("", response_model=ScreenshotListOut)
def list_screenshots(
    course_id: str | None = Query(default=None),
    chapter_id: str | None = Query(default=None),
    _: User = Depends(require_current_user),
    db: Session = Depends(get_db),
) -> ScreenshotListOut:
    query = db.query(Screenshot)
    if course_id:
        query = query.filter(Screenshot.course_id == course_id)
    if chapter_id:
        query = query.filter(Screenshot.chapter_id == chapter_id)
    screenshots = query.order_by(Screenshot.created_at.desc()).limit(200).all()
    items: list[ScreenshotItem] = []
    for screenshot in screenshots:
        course = db.query(Course).filter(Course.id == screenshot.course_id).first()
        chapter = db.query(Chapter).filter(Chapter.id == screenshot.chapter_id).first() if screenshot.chapter_id else None
        items.append(
            ScreenshotItem(
                id=screenshot.id,
                course_id=screenshot.course_id,
                course_title=course.title if course else None,
                chapter_id=screenshot.chapter_id,
                chapter_title=chapter.title if chapter else None,
                video_time_seconds=float(screenshot.video_time_seconds) if screenshot.video_time_seconds is not None else None,
                created_at=screenshot.created_at,
            )
        )
    return ScreenshotListOut(items=items)


@router.get("/{screenshot_id}/image")
def screenshot_image(screenshot_id: str, _: User = Depends(require_current_user), db: Session = Depends(get_db)) -> FileResponse:
    screenshot = db.query(Screenshot).filter(Screenshot.id == screenshot_id).first()
    if not screenshot:
        raise HTTPException(status_code=404, detail="Screenshot not found")
    path = Path(screenshot.file_path)
    if not path.is_file():
        raise HTTPException(status_code=404, detail="Screenshot file not found")
    media_type = "image/png" if path.suffix.lower() == ".png" else "image/jpeg"
    return FileResponse(path, media_type=media_type, filename=path.name)


@router.delete("/{screenshot_id}", status_code=204)
def delete_screenshot(screenshot_id: str, _: User = Depends(require_current_user), db: Session = Depends(get_db)) -> None:
    screenshot = db.query(Screenshot).filter(Screenshot.id == screenshot_id).first()
    if not screenshot:
        raise HTTPException(status_code=404, detail="Screenshot not found")
    path = Path(screenshot.file_path)
    db.delete(screenshot)
    db.commit()
    if path.is_file():
        path.unlink()


@router.put("/{screenshot_id}/image")
def update_screenshot_image(screenshot_id: str, payload: ScreenshotImageUpdateIn, _: User = Depends(require_current_user), db: Session = Depends(get_db)) -> dict[str, str]:
    screenshot = db.query(Screenshot).filter(Screenshot.id == screenshot_id).first()
    if not screenshot:
        raise HTTPException(status_code=404, detail="Screenshot not found")
    content, suffix = decode_base64_image(payload.image_base64, too_large_detail="Image too large")
    old_path = Path(screenshot.file_path)
    new_path = old_path.parent / f"{screenshot.id}{suffix}"
    new_path.write_bytes(content)
    screenshot.file_path = str(new_path)
    db.commit()
    if old_path.is_file() and old_path != new_path:
        old_path.unlink()
    return {"status": "ok"}
