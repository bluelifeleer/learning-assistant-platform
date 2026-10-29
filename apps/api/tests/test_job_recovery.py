"""中断任务回收（导入 / 导出）的单元测试。"""

from datetime import UTC, datetime, timedelta

from app.models.entities import Course, Export, ImportJob, Organization, Site, User
from app.services.job_recovery import (
    EXPORT_INTERRUPTED_MESSAGE,
    IMPORT_INTERRUPTED_MESSAGE,
    recover_stale_jobs,
)


def test_recover_marks_active_jobs_failed(session_factory) -> None:
    db = session_factory()
    try:
        organization = Organization(name="Recovery Org")
        db.add(organization)
        db.flush()
        user = User(email="recover@example.com", display_name="Recovery", password_hash="x")
        db.add(user)
        site = Site(adapter_id="recover-site", name="Recover")
        db.add(site)
        db.flush()
        course = Course(
            organization_id=organization.id,
            site_id=site.id,
            external_course_id="recover-course",
            title="恢复测试",
        )
        db.add(course)
        db.flush()

        running_import = ImportJob(
            organization_id=organization.id,
            user_id=user.id,
            source_filename="half.lapkg",
            size_bytes=10,
            strategy="merge",
            status="applying",
            progress=40,
        )
        queued_import = ImportJob(
            organization_id=organization.id,
            user_id=user.id,
            source_filename="fresh.lapkg",
            size_bytes=10,
            strategy="merge",
            status="queued",
            progress=0,
        )
        running_export = Export(
            organization_id=organization.id,
            user_id=user.id,
            course_id=course.id,
            format="package",
            status="running",
            progress=30,
        )
        done_export = Export(
            organization_id=organization.id,
            user_id=user.id,
            course_id=course.id,
            format="json",
            status="completed",
            progress=100,
        )
        db.add_all([running_import, queued_import, running_export, done_export])
        db.commit()
        ids = {
            "running_import": running_import.id,
            "queued_import": queued_import.id,
            "running_export": running_export.id,
            "done_export": done_export.id,
        }
    finally:
        db.close()

    stats = recover_stale_jobs(session_factory)

    assert stats == {"imports": 2, "exports": 1}
    db = session_factory()
    try:
        assert db.get(ImportJob, ids["running_import"]).status == "failed"
        assert db.get(ImportJob, ids["running_import"]).error == IMPORT_INTERRUPTED_MESSAGE
        assert db.get(ImportJob, ids["queued_import"]).error == IMPORT_INTERRUPTED_MESSAGE
        assert db.get(Export, ids["running_export"]).status == "failed"
        assert db.get(Export, ids["running_export"]).error == EXPORT_INTERRUPTED_MESSAGE
        assert db.get(Export, ids["running_export"]).progress == 0
        # 已完成的任务不能被误伤
        assert db.get(Export, ids["done_export"]).status == "completed"
    finally:
        db.close()


def test_recover_respects_grace_period(session_factory) -> None:
    """宽限期内刚创建的任务不动，避免多 worker 部署时误伤正在跑的任务。"""
    db = session_factory()
    try:
        organization = Organization(name="Grace Org")
        db.add(organization)
        db.flush()
        user = User(email="grace@example.com", display_name="Grace", password_hash="x")
        db.add(user)
        site = Site(adapter_id="grace-site", name="Grace")
        db.add(site)
        db.flush()
        course = Course(
            organization_id=organization.id,
            site_id=site.id,
            external_course_id="grace-course",
            title="宽限期",
        )
        db.add(course)
        db.flush()

        fresh = Export(
            organization_id=organization.id,
            user_id=user.id,
            course_id=course.id,
            format="package",
            status="running",
            progress=10,
        )
        db.add(fresh)
        db.commit()
        fresh_id = fresh.id
    finally:
        db.close()

    # created_at 是 server_default(now)，用较大的宽限期即可覆盖"刚创建"的场景
    stats = recover_stale_jobs(session_factory, grace_seconds=3600)

    assert stats == {"imports": 0, "exports": 0}
    db = session_factory()
    try:
        assert db.get(Export, fresh_id).status == "running"
    finally:
        db.close()


def test_recover_is_idempotent(session_factory) -> None:
    db = session_factory()
    try:
        organization = Organization(name="Idem Org")
        db.add(organization)
        db.flush()
        user = User(email="idem@example.com", display_name="Idem", password_hash="x")
        db.add(user)
        db.flush()
        db.add(
            ImportJob(
                organization_id=organization.id,
                user_id=user.id,
                source_filename="a.lapkg",
                size_bytes=1,
                strategy="merge",
                status="applying",
                progress=10,
            )
        )
        db.commit()
    finally:
        db.close()

    assert recover_stale_jobs(session_factory)["imports"] == 1
    assert recover_stale_jobs(session_factory)["imports"] == 0


def test_recover_with_explicit_now(session_factory) -> None:
    db = session_factory()
    try:
        organization = Organization(name="Now Org")
        db.add(organization)
        db.flush()
        user = User(email="now@example.com", display_name="Now", password_hash="x")
        db.add(user)
        db.flush()
        db.add(
            ImportJob(
                organization_id=organization.id,
                user_id=user.id,
                source_filename="b.lapkg",
                size_bytes=1,
                strategy="merge",
                status="validating",
                progress=5,
            )
        )
        db.commit()
    finally:
        db.close()

    future = datetime.now(UTC) + timedelta(minutes=5)
    stats = recover_stale_jobs(session_factory, now=future)

    assert stats["imports"] == 1
