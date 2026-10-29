"""启动时回收被中断的后台任务。

导入 / 导出都跑在进程内的 BackgroundTasks 里：API 重启或崩溃时，正在跑的任务会永远停在
`applying` / `running`，前端轮询到超时也拿不到结论，用户只能看到一条卡住的历史记录。

本模块在应用启动时把「还处于进行中」的任务标记为失败并写明原因，让界面可以重试。

注意：这里假设单进程部署（`scripts/dev.ps1` 起的是一个 uvicorn 进程）。如果用 `--workers`
多进程，后启动的 worker 会把别的 worker 正在跑的任务误判为中断——那种部署应把
`JOB_RECOVERY_GRACE_SECONDS` 调大，或改为共享队列（Redis 等）。
"""

from __future__ import annotations

import logging
from collections.abc import Callable
from datetime import UTC, datetime, timedelta

from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.db.session import SessionLocal
from app.models.entities import Export, ImportJob

logger = logging.getLogger(__name__)

#: 这些状态代表"任务还没结束"
ACTIVE_IMPORT_STATUSES = ("queued", "validating", "parsing", "applying")
ACTIVE_EXPORT_STATUSES = ("queued", "running")

IMPORT_INTERRUPTED_MESSAGE = "服务重启导致导入中断，请重新导入"
EXPORT_INTERRUPTED_MESSAGE = "服务重启导致导出中断，请重新导出"


def recover_stale_jobs(
    session_factory: Callable[[], Session] | None = None,
    *,
    grace_seconds: int | None = None,
    now: datetime | None = None,
) -> dict[str, int]:
    """把中断的任务标记为失败，返回受影响条数。"""
    factory = session_factory or SessionLocal
    effective_now = now or datetime.now(UTC)
    grace = get_settings().job_recovery_grace_seconds if grace_seconds is None else grace_seconds
    cutoff = effective_now - timedelta(seconds=max(grace, 0))

    stats = {"imports": 0, "exports": 0}
    db = factory()
    try:
        imports = (
            db.query(ImportJob)
            .filter(ImportJob.status.in_(ACTIVE_IMPORT_STATUSES), ImportJob.created_at <= cutoff)
            .all()
        )
        for job in imports:
            job.status = "failed"
            job.error = IMPORT_INTERRUPTED_MESSAGE
            job.progress = 0
            job.finished_at = effective_now
            stats["imports"] += 1

        exports = (
            db.query(Export)
            .filter(Export.status.in_(ACTIVE_EXPORT_STATUSES), Export.created_at <= cutoff)
            .all()
        )
        for export in exports:
            export.status = "failed"
            export.error = EXPORT_INTERRUPTED_MESSAGE
            export.progress = 0
            stats["exports"] += 1

        db.commit()
    except Exception:
        logger.exception("回收中断任务失败")
        db.rollback()
        return stats
    finally:
        db.close()

    if stats["imports"] or stats["exports"]:
        logger.warning("已回收中断任务：导入 %s 个、导出 %s 个", stats["imports"], stats["exports"])
    return stats
