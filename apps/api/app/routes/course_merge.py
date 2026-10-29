"""把来源课程合并进目标课程（仅 owner，不可撤销）。"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.deps import require_owner
from app.db.session import get_db
from app.models.entities import User
from app.schemas.workspace import CourseMergeIn, CourseMergeOut
from app.services import audit, course_merge
from app.services.tenancy import course_in_org, organization_for_user

router = APIRouter(prefix="/courses", tags=["courses"])


@router.post("/{source_id}/merge", response_model=CourseMergeOut)
def merge_course(
    source_id: str,
    payload: CourseMergeIn,
    user: User = Depends(require_owner),
    db: Session = Depends(get_db),
) -> CourseMergeOut:
    organization = organization_for_user(db, user)
    source = course_in_org(db, source_id, organization)
    if source is None:
        raise HTTPException(status_code=404, detail="Course not found")
    if payload.target_course_id == source_id:
        raise HTTPException(status_code=400, detail="不能把课程合并到自己")
    target = course_in_org(db, payload.target_course_id, organization)
    if target is None:
        raise HTTPException(status_code=404, detail="目标课程不存在")

    stats = course_merge.merge_courses(db, source, target)
    audit.record(
        db,
        audit.COURSES_MERGED,
        resource_type="course",
        resource_id=source_id,
        user_id=user.id,
        organization_id=organization.id,
        payload={
            "target_course_id": target.id,
            "source_title": source.title,
            "target_title": target.title,
            "stats": stats,
        },
    )
    db.commit()
    return CourseMergeOut(**stats)
