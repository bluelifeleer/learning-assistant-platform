from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.core.deps import require_current_user
from app.db.session import get_db
from app.models.entities import Membership, NoteImage, User
from app.schemas.workspace import NoteImageUploadIn, NoteImageUploadOut
from app.services.capture import decode_base64_image, note_images_dir_path
from app.services.plugins import ensure_default_organization

router = APIRouter(prefix="/notes", tags=["note-images"])


def _organization_id_for_user(db: Session, user: User) -> str:
    membership = db.query(Membership).filter(Membership.user_id == user.id).order_by(Membership.id.asc()).first()
    if membership:
        return membership.organization_id
    return ensure_default_organization(db).id


@router.post("/images", response_model=NoteImageUploadOut)
def upload_note_image(payload: NoteImageUploadIn, user: User = Depends(require_current_user), db: Session = Depends(get_db)) -> NoteImageUploadOut:
    content, suffix = decode_base64_image(payload.image_base64, too_large_detail="Image too large")
    note_image = NoteImage(
        organization_id=_organization_id_for_user(db, user),
        user_id=user.id,
        file_path="",
    )
    db.add(note_image)
    db.flush()
    path = note_images_dir_path() / f"{note_image.id}{suffix}"
    path.write_bytes(content)
    note_image.file_path = str(path)
    db.commit()
    return NoteImageUploadOut(id=note_image.id)


@router.get("/images/{image_id}/image")
def note_image_image(image_id: str, _: User = Depends(require_current_user), db: Session = Depends(get_db)) -> FileResponse:
    note_image = db.query(NoteImage).filter(NoteImage.id == image_id).first()
    if not note_image:
        raise HTTPException(status_code=404, detail="Note image not found")
    path = Path(note_image.file_path)
    if not path.is_file():
        raise HTTPException(status_code=404, detail="Note image file not found")
    media_type = "image/png" if path.suffix.lower() == ".png" else "image/jpeg"
    return FileResponse(path, media_type=media_type, filename=path.name)
