import hashlib
import io
import json
import zipfile
from pathlib import Path

import pytest

from app.models.entities import (
    Chapter,
    ChapterMemo,
    ChapterSummary,
    Course,
    CourseSummary,
    Note,
    NoteImage,
    QuizQuestion,
    ReviewCard,
    Screenshot,
    TranscriptSegment,
)
from app.routes import imports as imports_route
from app.services.import_source import ImportValidationError, LapkgSource
from tests.test_exports import TINY_JPEG_BASE64, capture_screenshot
from tests.test_note_capture import capture_sample_course, create_plugin_token


def _manifest(**overrides) -> dict:
    manifest = {
        "schema_version": 1,
        "app_version": "0.1.0",
        "exported_at": "2026-10-28T00:00:00+00:00",
        "organization": {"id": "org-1", "name": "Local Workspace"},
        "scope": {"type": "courses", "course_count": 1},
        "counts": {"courses": 1, "chapters": 1},
        "media": {"included": False, "file_count": 0, "bytes": 0},
        "checksums": {},
    }
    manifest.update(overrides)
    return manifest


def _zip(entries: dict[str, bytes]) -> bytes:
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w") as archive:
        for name, data in entries.items():
            archive.writestr(name, data)
    return buffer.getvalue()


def _minimal_package(*, checksum_ok: bool = True, schema_version: int = 1) -> bytes:
    course = {
        "id": "course-imported",
        "site": {"adapter_id": "wencai-school", "name": "文才学堂", "host_patterns": {}},
        "external_course_id": "course-imported",
        "title": "导入的课程",
        "term": "2026 秋",
        "metadata": {},
        "archived": False,
        "chapters": [
            {
                "id": "chapter-imported",
                "parent_id": None,
                "external_chapter_id": "1.1",
                "title": "1.1 章节",
                "sort_order": 1,
                "duration_seconds": 60,
                "metadata": {},
            }
        ],
        "summary": None,
        "notes": [],
        "screenshots": [],
        "note_images": [],
    }
    chapter = {
        "id": "chapter-imported",
        "external_chapter_id": "1.1",
        "title": "1.1 章节",
        "video": None,
        "transcripts": [{"id": "t1", "start_seconds": 0, "end_seconds": 2, "text": "第一句话", "source": "page"}],
        "notes": [
            {
                "id": "note-imported",
                "user_id": "old-user",
                "chapter_id": "chapter-imported",
                "video_time_seconds": 1.5,
                "content": "导入的笔记",
                "corrected_content": None,
                "tags": ["考点"],
                "created_at": "2026-10-01T10:00:00+00:00",
            }
        ],
        "screenshots": [],
        "note_images": [],
        "chapter_summary": None,
        "memo": None,
    }
    payload = {
        "courses/course-imported/course.json": json.dumps(course).encode(),
        "courses/course-imported/chapters/chapter-imported.json": json.dumps(chapter).encode(),
    }
    checksums = {name: "sha256:" + hashlib.sha256(data).hexdigest() for name, data in payload.items()}
    if not checksum_ok:
        checksums["courses/course-imported/course.json"] = "sha256:" + "0" * 64
    payload["manifest.json"] = json.dumps(_manifest(checksums=checksums, schema_version=schema_version)).encode()
    return _zip(payload)


@pytest.fixture
def import_client(client, session_factory, monkeypatch):
    """后台任务必须用测试库的 session，否则会写到真实数据库。"""
    monkeypatch.setattr(imports_route, "SessionLocal", session_factory)
    return client


# ---------------------------------------------------------------------------
# 解析与校验（不碰库）
# ---------------------------------------------------------------------------


def test_parse_rejects_non_zip() -> None:
    with pytest.raises(ImportValidationError, match="不是有效的 zip"):
        LapkgSource().parse(b"this is not a zip")


def test_parse_requires_manifest() -> None:
    blob = _zip({"courses/x/course.json": b"{}"})

    with pytest.raises(ImportValidationError, match="manifest.json"):
        LapkgSource().parse(blob)


def test_parse_rejects_newer_schema_version() -> None:
    with pytest.raises(ImportValidationError, match="版本不受支持"):
        LapkgSource().parse(_minimal_package(schema_version=99))


def test_parse_rejects_checksum_mismatch() -> None:
    with pytest.raises(ImportValidationError, match="校验失败"):
        LapkgSource().parse(_minimal_package(checksum_ok=False))


def test_parse_rejects_path_traversal() -> None:
    blob = _zip({"../../evil.json": b"{}", "manifest.json": json.dumps(_manifest()).encode()})

    with pytest.raises(ImportValidationError, match="路径穿越"):
        LapkgSource().parse(blob)


def test_parse_rejects_unsupported_extension() -> None:
    blob = _zip({"payload.exe": b"MZ", "manifest.json": json.dumps(_manifest()).encode()})

    with pytest.raises(ImportValidationError, match="不支持的文件类型"):
        LapkgSource().parse(blob)


def test_parse_minimal_package() -> None:
    plan = LapkgSource().parse(_minimal_package())

    assert plan.schema_version == 1
    assert len(plan.courses) == 1
    assert plan.courses[0].document["title"] == "导入的课程"
    assert "chapter-imported" in plan.courses[0].chapters


# ---------------------------------------------------------------------------
# 端到端：导出的包能原样导回来
# ---------------------------------------------------------------------------


def _clear_course_data(session_factory, course_id: str) -> None:
    db = session_factory()
    try:
        for model in (TranscriptSegment, Note, Screenshot, ReviewCard, QuizQuestion):
            db.query(model).filter(model.course_id == course_id).delete()
        for model in (ChapterSummary, ChapterMemo, CourseSummary):
            db.query(model).filter(model.course_id == course_id).delete()
        db.query(NoteImage).delete()
        db.query(Chapter).filter(Chapter.course_id == course_id).delete()
        db.query(Course).filter(Course.id == course_id).delete()
        db.commit()
    finally:
        db.close()


def _export_package(client, headers, course_id: str, include_media: bool = True) -> bytes:
    created = client.post(
        "/api/v1/exports",
        headers=headers,
        json={"export_format": "package", "course_ids": [course_id], "include_media": include_media},
    )
    assert created.status_code == 200, created.text
    download = client.get(f"/api/v1/exports/{created.json()['id']}/download", headers=headers)
    assert download.status_code == 200
    return download.content


def test_package_round_trip_restores_course(import_client, session_factory, auth_headers) -> None:
    client = import_client
    token = create_plugin_token(client, auth_headers)
    capture_sample_course(client, token)
    capture_screenshot(client, token)
    transcript = client.post(
        "/api/v1/capture/transcript-segment",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "external_course_id": "course-1",
            "external_chapter_id": "1.1",
            "start_seconds": 0,
            "end_seconds": 3,
            "text": "第一节 课程导论",
            "source": "page",
        },
    )
    assert transcript.status_code == 200
    note = client.post(
        "/api/v1/capture/note",
        headers={"Authorization": f"Bearer {token}"},
        json={"external_course_id": "course-1", "external_chapter_id": "1.1", "content": "关键概念"},
    )
    assert note.status_code == 200
    client.post("/api/v1/review/cards", headers=auth_headers, json={"note_id": note.json()["note_id"]})

    course = client.get("/api/v1/courses", headers=auth_headers).json()["items"][0]
    course_id = course["id"]

    # 先导出（此时媒体文件还在），再模拟「另一台设备」：库和磁盘都没有这门课
    blob = _export_package(client, auth_headers, course_id)

    db = session_factory()
    try:
        screenshot = db.query(Screenshot).filter(Screenshot.course_id == course_id).first()
        screenshot_path = Path(screenshot.file_path)
    finally:
        db.close()
    assert screenshot_path.is_file()
    screenshot_path.unlink()

    _clear_course_data(session_factory, course_id)
    assert client.get("/api/v1/courses", headers=auth_headers).json()["items"] == []

    response = client.post(
        "/api/v1/imports",
        headers=auth_headers,
        files={"file": ("course.lapkg", blob, "application/zip")},
        data={"strategy": "merge"},
    )
    assert response.status_code == 202, response.text
    job_id = response.json()["job_id"]

    job = client.get(f"/api/v1/imports/{job_id}", headers=auth_headers).json()
    assert job["status"] == "done", job
    assert job["progress"] == 100
    stats = job["stats"]
    assert stats["courses_created"] == 1
    assert stats["chapters_created"] == 2
    assert stats["screenshots_added"] == 1
    assert stats["transcripts_added"] == 1
    assert stats["notes_added"] >= 1
    assert stats["cards_added"] == 1
    assert stats["media_written"] >= 1

    # 课程按包内 id 复原，笔记与截图都回来了
    restored = client.get("/api/v1/courses", headers=auth_headers).json()["items"]
    assert [item["id"] for item in restored] == [course_id]
    db = session_factory()
    try:
        assert db.query(Screenshot).filter(Screenshot.course_id == course_id).count() == 1
        assert db.query(TranscriptSegment).filter(TranscriptSegment.course_id == course_id).count() >= 1
        assert db.query(Note).filter(Note.course_id == course_id).count() >= 1
        assert db.query(ReviewCard).filter(ReviewCard.course_id == course_id).count() == 1
        restored_shot = db.query(Screenshot).filter(Screenshot.course_id == course_id).first()
        assert Path(restored_shot.file_path).is_file()
    finally:
        db.close()


def test_reimport_is_idempotent(import_client, session_factory, auth_headers) -> None:
    client = import_client
    token = create_plugin_token(client, auth_headers)
    capture_sample_course(client, token)
    course_id = client.get("/api/v1/courses", headers=auth_headers).json()["items"][0]["id"]
    blob = _export_package(client, auth_headers, course_id, include_media=False)

    first = client.post(
        "/api/v1/imports",
        headers=auth_headers,
        files={"file": ("course.lapkg", blob, "application/zip")},
    )
    first_job = client.get(f"/api/v1/imports/{first.json()['job_id']}", headers=auth_headers).json()
    assert first_job["stats"]["courses_created"] == 0
    assert first_job["stats"]["courses_matched"] == 1
    assert first_job["stats"]["chapters_created"] == 0

    second = client.post(
        "/api/v1/imports",
        headers=auth_headers,
        files={"file": ("course.lapkg", blob, "application/zip")},
    )
    second_job = client.get(f"/api/v1/imports/{second.json()['job_id']}", headers=auth_headers).json()
    assert second_job["stats"]["chapters_created"] == 0
    assert second_job["stats"]["transcripts_added"] == 0


def test_dry_run_reports_plan_without_writing(import_client, session_factory, auth_headers) -> None:
    client = import_client
    blob = _minimal_package()

    response = client.post(
        "/api/v1/imports",
        headers=auth_headers,
        files={"file": ("course.lapkg", blob, "application/zip")},
        data={"dry_run": "true"},
    )
    assert response.status_code == 202
    job = client.get(f"/api/v1/imports/{response.json()['job_id']}", headers=auth_headers).json()

    assert job["status"] == "done"
    assert job["dry_run"] is True
    assert job["stats"]["courses_created"] == 1
    assert job["stats"]["notes_added"] == 1
    # 只统计不落库
    db = session_factory()
    try:
        assert db.query(Course).count() == 0
        assert db.query(Note).count() == 0
    finally:
        db.close()


def test_invalid_package_marks_job_failed(import_client, auth_headers) -> None:
    response = import_client.post(
        "/api/v1/imports",
        headers=auth_headers,
        files={"file": ("broken.lapkg", b"definitely not a zip", "application/zip")},
    )
    assert response.status_code == 202
    job = import_client.get(f"/api/v1/imports/{response.json()['job_id']}", headers=auth_headers).json()

    assert job["status"] == "failed"
    assert "zip" in (job["error"] or "")


def test_upload_rejects_wrong_extension(import_client, auth_headers) -> None:
    response = import_client.post(
        "/api/v1/imports",
        headers=auth_headers,
        files={"file": ("note.md", b"# hello", "text/markdown")},
    )

    assert response.status_code == 400


def test_unsupported_strategy_is_rejected(import_client, auth_headers) -> None:
    response = import_client.post(
        "/api/v1/imports",
        headers=auth_headers,
        files={"file": ("course.lapkg", _minimal_package(), "application/zip")},
        data={"strategy": "replace"},
    )

    assert response.status_code == 400


def test_cancel_finished_job_returns_conflict(import_client, auth_headers) -> None:
    response = import_client.post(
        "/api/v1/imports",
        headers=auth_headers,
        files={"file": ("course.lapkg", _minimal_package(), "application/zip")},
    )
    job_id = response.json()["job_id"]

    cancelled = import_client.post(f"/api/v1/imports/{job_id}/cancel", headers=auth_headers)

    assert cancelled.status_code == 409


def test_report_endpoint_returns_json(import_client, auth_headers) -> None:
    response = import_client.post(
        "/api/v1/imports",
        headers=auth_headers,
        files={"file": ("course.lapkg", _minimal_package(), "application/zip")},
    )
    job_id = response.json()["job_id"]

    report = import_client.get(f"/api/v1/imports/{job_id}/report", headers=auth_headers)

    assert report.status_code == 200
    body = report.json()
    assert body["job_id"] == job_id
    assert body["status"] == "done"
    assert body["stats"]["courses_created"] == 1
    assert "attachment" in report.headers["content-disposition"]


def test_unknown_job_returns_404(import_client, auth_headers) -> None:
    assert import_client.get("/api/v1/imports/nope", headers=auth_headers).status_code == 404
    assert import_client.post("/api/v1/imports/nope/cancel", headers=auth_headers).status_code == 404


def test_tiny_media_helper_is_used_by_capture() -> None:
    """防止 TINY_JPEG_BASE64 被改成空串导致媒体用例失去意义。"""
    assert len(TINY_JPEG_BASE64) > 50
