"""导出文件保留策略：按份数 / 天数清理历史导出，避免 exports 目录无限增长。

同时删除数据库记录与磁盘文件——只删记录会留下永远没人引用的孤儿文件。
"""

from __future__ import annotations

import logging
import threading
from collections.abc import Callable
from datetime import UTC, datetime, timedelta
from pathlib import Path

from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.db.session import SessionLocal
from app.models.entities import Export

logger = logging.getLogger(__name__)


def _delete_export(db: Session, export: Export) -> None:
    if export.file_path:
        try:
            Path(export.file_path).unlink(missing_ok=True)
        except OSError:
            logger.warning("删除导出文件失败: %s", export.file_path, exc_info=True)
    db.delete(export)


def cleanup_exports(
    db: Session,
    *,
    keep_days: int = 0,
    keep_count: int = 0,
    organization_id: str | None = None,
    now: datetime | None = None,
) -> dict[str, int]:
    """按保留策略清理导出记录。

    - keep_count > 0：只保留最新的 N 份（按创建时间倒序）
    - keep_days > 0：删除创建时间早于 N 天前的
    两条同时给时取「删得更狠」的那批。`organization_id` 为空表示所有组织。
    """
    stats = {"deleted": 0, "files_removed": 0, "kept": 0}
    query = db.query(Export)
    if organization_id:
        query = query.filter(Export.organization_id == organization_id)
    if keep_days <= 0 and keep_count <= 0:
        stats["kept"] = query.count()
        return stats

    effective_now = now or datetime.now(UTC)
    exports = query.order_by(Export.created_at.desc()).all()
    cutoff = effective_now - timedelta(days=keep_days) if keep_days > 0 else None

    for index, export in enumerate(exports):
        too_many = keep_count > 0 and index >= keep_count
        too_old = cutoff is not None and _older_than(export, cutoff)
        if not too_many and not too_old:
            stats["kept"] += 1
            continue
        had_file = bool(export.file_path and Path(export.file_path).is_file())
        _delete_export(db, export)
        stats["deleted"] += 1
        stats["files_removed"] += 1 if had_file else 0

    db.commit()
    return stats


def _older_than(export: Export, cutoff: datetime) -> bool:
    created = export.created_at
    if created is None:
        return False
    if created.tzinfo is None:
        created = created.replace(tzinfo=UTC)
    return created < cutoff


def _scheduler_loop(interval_seconds: int) -> None:
    while True:
        threading.Event().wait(interval_seconds)
        run_cleanup_tick()


def run_cleanup_tick(session_factory: Callable[[], Session] = SessionLocal) -> dict[str, int]:
    settings = get_settings()
    if settings.export_retention_days <= 0 and settings.export_retention_count <= 0:
        return {"deleted": 0, "files_removed": 0, "kept": 0}
    db = session_factory()
    try:
        stats = cleanup_exports(
            db,
            keep_days=settings.export_retention_days,
            keep_count=settings.export_retention_count,
        )
        if stats["deleted"]:
            logger.info("导出清理完成：删除 %s 条记录、%s 个文件", stats["deleted"], stats["files_removed"])
        return stats
    except Exception:
        logger.exception("导出清理失败")
        db.rollback()
        return {"deleted": 0, "files_removed": 0, "kept": 0}
    finally:
        db.close()


def start_export_cleanup_scheduler() -> threading.Thread:
    interval = get_settings().export_cleanup_interval_seconds
    thread = threading.Thread(target=_scheduler_loop, args=(interval,), name="export-cleanup", daemon=True)
    thread.start()
    return thread
