from fastapi import APIRouter

router = APIRouter(prefix="/courses", tags=["courses"])


@router.get("")
def list_courses() -> dict[str, list]:
    return {"items": []}


@router.get("/{course_id}")
def get_course(course_id: str) -> dict[str, str]:
    return {"id": course_id, "status": "not_loaded"}
