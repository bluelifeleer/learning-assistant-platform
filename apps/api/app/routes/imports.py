import hashlib
import logging
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, HTTPException, Response, UploadFile, status
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from app.core.deps import require_current_user
from app.db.session import SessionLocal, get_db
from app.models.entities import Course, ImportJob, Organization, User
from app.routes.exports import organization_for_user
from app.schemas.workspace import ImportJobItem, ImportJobListOut, ImportStartOut
from app.services import audit
from app.services.import_source import ImportValidationError, source_for_filename
from app.services.importer import SUPPORTED_STRATEGIES, CancelledError, run_import

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/imports", tags=["imports"])

MAX_UPLOAD_BYTES = 200 * 1024 * 1024
CANCELLABLE_STATUSES = {"queued", "validating", "parsing", "applying"}


def _job_item(job: ImportJob) -> ImportJobItem:
    return ImportJobItem(
        id=job.id,
        source_filename=job.source_filename,
        size_bytes=job.size_bytes or 0,
        checksum=job.checksum,
        strategy=job.strategy,
        dry_run=job.dry_run,
        target_course_id=job.target_course_id,
        status=job.status,
        progress=job.progress or 0,
        stats=job.stats or None,
        error=job.error,
        created_at=job.created_at,
        finished_at=job.finished_at,
    )


async def _read_upload(file: UploadFile) -> bytes:
    filename = file.filename or ""
    try:
        source_for_filename(filename)
    except ImportValidationError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    chunks: list[bytes] = []
    total = 0
    while chunk := await file.read(1024 * 1024):
        total += len(chunk)
        if total > MAX_UPLOAD_BYTES:
            raise HTTPException(
                status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                detail=f"包体积超过上限（{MAX_UPLOAD_BYTES // 1024 // 1024} MB）",
            )
        chunks.append(chunk)
    if not chunks:
        raise HTTPException(status_code=400, detail="上传的文件为空")
    return b"".join(chunks)


def run_import_job(job_id: str, data: bytes, session_factory=None) -> None:
    """后台执行导入。TestClient 下会随响应同步跑完，进程内是异步的。"""
    factory = session_factory or SessionLocal
    db = factory()
    job: ImportJob | None = None
    try:
        job = db.get(ImportJob, job_id)
        if job is None or job.status in {"canceled", "done", "failed"}:
            return
        organization = db.get(Organization, job.organization_id)
        user = db.get(User, job.user_id)
        if organization is None or user is None:
            job.status = "failed"
            job.error = "组织或用户已不存在"
            job.finished_at = datetime.now(UTC)
            db.commit()
            return

        job.status = "validating"
        job.progress = 5
        db.commit()
        try:
            plan = source_for_filename(job.source_filename).parse(data)
        except ImportValidationError as exc:
            job.status = "failed"
            job.error = str(exc)[:1000]
            job.finished_at = datetime.now(UTC)
            db.commit()
            audit.record(
                db,
                audit.IMPORT_FAILED,
                resource_type="import_job",
                resource_id=job.id,
                user_id=job.user_id,
                organization_id=job.organization_id,
                payload={"error": job.error},
            )
            db.commit()
            return

        job.status = "applying"
        job.progress = 25
        db.commit()

        def on_progress(percent: int) -> None:
            job.progress = min(25 + int(percent * 0.7), 95)
            db.commit()

        def should_cancel() -> bool:
            db.refresh(job)
            return job.status == "canceled"

        target_course = db.get(Course, job.target_course_id) if job.target_course_id else None
        stats = run_import(
            db,
            organization,
            user,
            plan,
            dry_run=job.dry_run,
            strategy=job.strategy or "merge",
            target_course=target_course,
            on_progress=on_progress,
            should_cancel=should_cancel,
        )
        stats["source_type"] = plan.source_type
        job.stats = stats
        job.status = "done"
        job.progress = 100
        job.finished_at = datetime.now(UTC)
        audit.record(
            db,
            audit.IMPORT_COMPLETED,
            resource_type="import_job",
            resource_id=job.id,
            user_id=job.user_id,
            organization_id=job.organization_id,
            payload={
                "dry_run": job.dry_run,
                "courses": stats.get("courses_created"),
                "chapters": stats.get("chapters_created"),
                "notes": stats.get("notes_added"),
            },
        )
        db.commit()
    except CancelledError:
        if job is not None:
            job.status = "canceled"
            job.progress = 0
            job.finished_at = datetime.now(UTC)
            db.commit()
    except Exception as exc:  # noqa: BLE001 - 后台任务必须吞掉异常并落到任务上
        logger.exception("import job %s failed", job_id)
        db.rollback()
        if job is not None:
            job.status = "failed"
            job.error = str(exc)[:1000]
            job.finished_at = datetime.now(UTC)
            db.commit()
    finally:
        db.close()


@router.post("", status_code=status.HTTP_202_ACCEPTED, response_model=ImportStartOut)
async def create_import(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    strategy: str = Form("merge"),
    dry_run: bool = Form(False),
    course_id: str = Form(""),
    user: User = Depends(require_current_user),
    db: Session = Depends(get_db),
) -> ImportStartOut:
    if strategy not in SUPPORTED_STRATEGIES:
        raise HTTPException(status_code=400, detail="不支持的导入策略（可选 merge / new / replace）")
    data = await _read_upload(file)

    organization = organization_for_user(db, user)
    source = source_for_filename(file.filename or "")
    target_course = None
    if course_id.strip():
        if source.source_type == "lapkg":
            raise HTTPException(
                status_code=400,
                detail="完整包自带课程结构，不能指定目标课程（只有 Anki TSV / CSV 可以）",
            )
        target_course = (
            db.query(Course)
            .filter(Course.id == course_id.strip(), Course.organization_id == organization.id)
            .first()
        )
        if target_course is None:
            raise HTTPException(status_code=404, detail="目标课程不存在")

    checksum = "sha256:" + hashlib.sha256(data).hexdigest()
    # 同一个包 24 小时内已经导入过就提示一下（仍然允许再导，merge 会去重）
    duplicate = (
        db.query(ImportJob)
        .filter(
            ImportJob.organization_id == organization.id,
            ImportJob.checksum == checksum,
            ImportJob.status == "done",
            # 预览没有真正写入，不能算"已经导入过"
            ImportJob.dry_run.is_(False),
            ImportJob.created_at >= datetime.now(UTC) - timedelta(hours=24),
        )
        .order_by(ImportJob.created_at.desc())
        .first()
    )

    job = ImportJob(
        organization_id=organization.id,
        user_id=user.id,
        source_filename=(file.filename or "package.lapkg")[:255],
        size_bytes=len(data),
        checksum=checksum,
        strategy=strategy,
        dry_run=dry_run,
        target_course_id=target_course.id if target_course else None,
        status="queued",
        progress=0,
    )
    db.add(job)
    db.flush()
    audit.record(
        db,
        audit.IMPORT_CREATED,
        resource_type="import_job",
        resource_id=job.id,
        user_id=user.id,
        organization_id=organization.id,
        payload={
            "filename": job.source_filename,
            "size": len(data),
            "dry_run": dry_run,
            "strategy": strategy,
            "source_type": source.source_type,
            "target_course_id": job.target_course_id,
        },
    )
    db.commit()
    db.refresh(job)

    background_tasks.add_task(run_import_job, job.id, data)
    return ImportStartOut(
        job_id=job.id,
        status=job.status,
        dry_run=job.dry_run,
        duplicate_of=duplicate.id if duplicate else None,
    )


@router.get("", response_model=ImportJobListOut)
def list_imports(user: User = Depends(require_current_user), db: Session = Depends(get_db)) -> ImportJobListOut:
    organization = organization_for_user(db, user)
    jobs = (
        db.query(ImportJob)
        .filter(ImportJob.organization_id == organization.id)
        .order_by(ImportJob.created_at.desc())
        .limit(100)
        .all()
    )
    return ImportJobListOut(items=[_job_item(job) for job in jobs])


@router.get("/{job_id}", response_model=ImportJobItem)
def read_import(job_id: str, user: User = Depends(require_current_user), db: Session = Depends(get_db)) -> ImportJobItem:
    organization = organization_for_user(db, user)
    job = db.query(ImportJob).filter(ImportJob.id == job_id, ImportJob.organization_id == organization.id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Import job not found")
    return _job_item(job)


@router.post("/{job_id}/cancel", status_code=status.HTTP_204_NO_CONTENT)
def cancel_import(job_id: str, user: User = Depends(require_current_user), db: Session = Depends(get_db)) -> Response:
    organization = organization_for_user(db, user)
    job = db.query(ImportJob).filter(ImportJob.id == job_id, ImportJob.organization_id == organization.id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Import job not found")
    if job.status not in CANCELLABLE_STATUSES:
        raise HTTPException(status_code=409, detail="任务已结束，无法取消")
    job.status = "canceled"
    job.finished_at = datetime.now(UTC)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/{job_id}/report")
def download_import_report(
    job_id: str, user: User = Depends(require_current_user), db: Session = Depends(get_db)
) -> JSONResponse:
    organization = organization_for_user(db, user)
    job = db.query(ImportJob).filter(ImportJob.id == job_id, ImportJob.organization_id == organization.id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Import job not found")
    report = {
        "job_id": job.id,
        "source_filename": job.source_filename,
        "size_bytes": job.size_bytes,
        "checksum": job.checksum,
        "strategy": job.strategy,
        "dry_run": job.dry_run,
        "target_course_id": job.target_course_id,
        "status": job.status,
        "progress": job.progress,
        "error": job.error,
        "stats": job.stats or {},
        "created_at": job.created_at.isoformat() if job.created_at else None,
        "finished_at": job.finished_at.isoformat() if job.finished_at else None,
    }
    return JSONResponse(
        content=report,
        headers={"Content-Disposition": f'attachment; filename="import-{job.id}.json"'},
    )
