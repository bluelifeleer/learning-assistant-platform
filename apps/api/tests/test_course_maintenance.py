"""课程数据维护：真正删除（含子表与媒体）、批量归档/恢复。"""

from datetime import UTC, datetime
from pathlib import Path
from uuid import uuid4

from app.models.entities import (
    Chapter,
    ChapterMemo,
    ChapterSummary,
    Course,
    CourseSummary,
    Export,
    Membership,
    Note,
    Organization,
    QuizAttempt,
    QuizQuestion,
    ReviewCard,
    Screenshot,
    Site,
    TranscriptSegment,
    User,
    VideoSession,
)


def _register(client, session_factory, role: str = "owner") -> dict:
    email = f"course-{role}-{uuid4().hex[:8]}@example.com"
    response = client.post(
        "/api/v1/auth/register",
        json={"email": email, "password": "secret123", "display_name": f"Course {role}"},
    )
    assert response.status_code == 200, response.text
    headers = {"Authorization": f"Bearer {response.json()['token']}"}
    db = session_factory()
    try:
        user = db.query(User).filter(User.email == email).first()
        membership = db.query(Membership).filter(Membership.user_id == user.id).first()
        membership.role = role
        db.commit()
        return {"headers": headers, "user_id": user.id, "organization_id": membership.organization_id}
    finally:
        db.close()


def _seed_course(session_factory, organization_id: str, user_id: str, screenshots_dir: Path) -> dict:
    """造一门"装满数据"的课程：章节、字幕、笔记、截图（含磁盘文件）、卡片、题目、会话、总结。"""
    db = session_factory()
    try:
        site = db.query(Site).filter(Site.adapter_id == "cleanup-site").first()
        if site is None:
            site = Site(adapter_id="cleanup-site", name="清理站点")
            db.add(site)
            db.flush()
        course = Course(
            organization_id=organization_id,
            site_id=site.id,
            external_course_id=f"cleanup-{uuid4().hex[:6]}",
            title="待删除课程",
        )
        db.add(course)
        db.flush()
        chapter = Chapter(course_id=course.id, title="第一章", external_chapter_id=f"ch-{uuid4().hex[:6]}")
        db.add(chapter)
        db.flush()
        db.add(
            TranscriptSegment(
                course_id=course.id, chapter_id=chapter.id, start_seconds=0, text="字幕一", source="test"
            )
        )
        db.add(Note(course_id=course.id, chapter_id=chapter.id, user_id=user_id, content="笔记一"))
        db.add(ChapterSummary(chapter_id=chapter.id, course_id=course.id, summary_md="章节总结", model="test"))
        db.add(ChapterMemo(chapter_id=chapter.id, course_id=course.id, content_md="备忘"))
        db.add(CourseSummary(course_id=course.id, summary_md="课程总结", model="test"))
        db.add(
            ReviewCard(
                organization_id=organization_id,
                course_id=course.id,
                user_id=user_id,
                front="正面",
                back="背面",
                due_at=datetime.now(UTC),
            )
        )
        quiz_question = QuizQuestion(
            course_id=course.id,
            chapter_id=chapter.id,
            question_type="choice",
            question="题?",
            options=["A", "B"],
            answer="A",
            model="test",
        )
        db.add(quiz_question)
        db.flush()
        db.add(
            QuizAttempt(
                course_id=course.id,
                chapter_id=chapter.id,
                organization_id=organization_id,
                user_id=user_id,
                question_id=quiz_question.id,
                chosen="A",
                correct=True,
            )
        )
        db.add(
            VideoSession(
                course_id=course.id, chapter_id=chapter.id, user_id=user_id, source_url="https://example.test/v/1"
            )
        )

        screenshots_dir.mkdir(parents=True, exist_ok=True)
        media = screenshots_dir / f"shot-{uuid4().hex[:8]}.png"
        media.write_bytes(b"\x89PNG\r\n\x1a\n")
        db.add(
            Screenshot(
                organization_id=organization_id,
                course_id=course.id,
                chapter_id=chapter.id,
                user_id=user_id,
                file_path=str(media),
            )
        )
        export = Export(
            organization_id=organization_id,
            user_id=user_id,
            course_id=course.id,
            format="markdown",
            status="completed",
            progress=100,
        )
        db.add(export)
        db.commit()
        return {"course_id": course.id, "media_path": media, "export_id": export.id}
    finally:
        db.close()


def _counts(session_factory, course_id: str) -> dict:
    db = session_factory()
    try:
        return {
            "course": db.query(Course).filter(Course.id == course_id).count(),
            "chapters": db.query(Chapter).filter(Chapter.course_id == course_id).count(),
            "transcripts": db.query(TranscriptSegment).filter(TranscriptSegment.course_id == course_id).count(),
            "notes": db.query(Note).filter(Note.course_id == course_id).count(),
            "screenshots": db.query(Screenshot).filter(Screenshot.course_id == course_id).count(),
            "cards": db.query(ReviewCard).filter(ReviewCard.course_id == course_id).count(),
            "quiz": db.query(QuizQuestion).filter(QuizQuestion.course_id == course_id).count(),
            "sessions": db.query(VideoSession).filter(VideoSession.course_id == course_id).count(),
        }
    finally:
        db.close()


def test_delete_course_removes_children_and_media(client, session_factory, tmp_path) -> None:
    account = _register(client, session_factory)
    seeded = _seed_course(session_factory, account["organization_id"], account["user_id"], tmp_path / "shots")
    assert _counts(session_factory, seeded["course_id"])["chapters"] == 1

    response = client.delete(f"/api/v1/courses/{seeded['course_id']}", headers=account["headers"])

    assert response.status_code == 200, response.text
    assert response.json() == {"deleted": 1, "chapters": 1, "files_removed": 1}
    assert _counts(session_factory, seeded["course_id"]) == {
        "course": 0,
        "chapters": 0,
        "transcripts": 0,
        "notes": 0,
        "screenshots": 0,
        "cards": 0,
        "quiz": 0,
        "sessions": 0,
    }
    assert not Path(seeded["media_path"]).exists()

    # 导出记录保留，只把课程引用置空
    db = session_factory()
    try:
        export = db.get(Export, seeded["export_id"])
        assert export is not None and export.course_id is None
    finally:
        db.close()


def test_delete_course_requires_owner(client, session_factory, tmp_path) -> None:
    owner = _register(client, session_factory, role="owner")
    member = _register(client, session_factory, role="member")
    # member 与 owner 不在同一组织时也无所谓，这里只验证权限
    seeded = _seed_course(session_factory, owner["organization_id"], owner["user_id"], tmp_path / "shots")

    response = client.delete(f"/api/v1/courses/{seeded['course_id']}", headers=member["headers"])

    assert response.status_code == 403
    assert _counts(session_factory, seeded["course_id"])["course"] == 1


def test_delete_unknown_course_returns_404(client, session_factory) -> None:
    account = _register(client, session_factory)

    assert client.delete("/api/v1/courses/does-not-exist", headers=account["headers"]).status_code == 404


def test_delete_course_from_other_org_returns_404(client, session_factory, tmp_path) -> None:
    owner = _register(client, session_factory, role="owner")

    db = session_factory()
    try:
        other_org = Organization(name="别的组织")
        db.add(other_org)
        db.flush()
        site = Site(adapter_id=f"other-{uuid4().hex[:6]}", name="别的站点")
        db.add(site)
        db.flush()
        course = Course(
            organization_id=other_org.id,
            site_id=site.id,
            external_course_id=f"other-{uuid4().hex[:6]}",
            title="别人的课程",
        )
        db.add(course)
        db.commit()
        foreign_course_id = course.id
    finally:
        db.close()

    assert client.delete(f"/api/v1/courses/{foreign_course_id}", headers=owner["headers"]).status_code == 404
    assert _counts(session_factory, foreign_course_id)["course"] == 1


def _seed_simple_course(session_factory, organization_id: str, title: str) -> str:
    db = session_factory()
    try:
        site = db.query(Site).filter(Site.adapter_id == "cleanup-site").first()
        if site is None:
            site = Site(adapter_id="cleanup-site", name="清理站点")
            db.add(site)
            db.flush()
        course = Course(
            organization_id=organization_id,
            site_id=site.id,
            external_course_id=f"archive-{uuid4().hex[:6]}",
            title=title,
        )
        db.add(course)
        db.commit()
        return course.id
    finally:
        db.close()


def test_bulk_archive_and_restore(client, session_factory) -> None:
    account = _register(client, session_factory)
    first = _seed_simple_course(session_factory, account["organization_id"], "课程甲")
    second = _seed_simple_course(session_factory, account["organization_id"], "课程乙")

    archived = client.post(
        "/api/v1/courses/bulk-archive",
        headers=account["headers"],
        json={"ids": [first, second, "missing"], "archived": True},
    )

    assert archived.status_code == 200, archived.text
    assert archived.json() == {"updated": 2, "archived": True}
    db = session_factory()
    try:
        assert db.get(Course, first).archived_at is not None
        assert db.get(Course, second).archived_at is not None
    finally:
        db.close()

    restored = client.post(
        "/api/v1/courses/bulk-archive",
        headers=account["headers"],
        json={"ids": [first, second], "archived": False},
    )

    assert restored.json() == {"updated": 2, "archived": False}
    db = session_factory()
    try:
        assert db.get(Course, first).archived_at is None
        assert db.get(Course, second).archived_at is None
    finally:
        db.close()


def test_bulk_archive_skips_other_org_courses(client, session_factory) -> None:
    account = _register(client, session_factory)
    mine = _seed_simple_course(session_factory, account["organization_id"], "我的课程")

    db = session_factory()
    try:
        other_org = Organization(name="别的组织")
        db.add(other_org)
        db.flush()
        site = db.query(Site).filter(Site.adapter_id == "cleanup-site").first()
        foreign = Course(
            organization_id=other_org.id,
            site_id=site.id,
            external_course_id=f"foreign-{uuid4().hex[:6]}",
            title="别人的课程",
        )
        db.add(foreign)
        db.commit()
        foreign_id = foreign.id
    finally:
        db.close()

    response = client.post(
        "/api/v1/courses/bulk-archive",
        headers=account["headers"],
        json={"ids": [mine, foreign_id], "archived": True},
    )

    assert response.json()["updated"] == 1
    db = session_factory()
    try:
        assert db.get(Course, foreign_id).archived_at is None
    finally:
        db.close()


def test_member_can_bulk_archive(client, session_factory) -> None:
    member = _register(client, session_factory, role="member")
    course_id = _seed_simple_course(session_factory, member["organization_id"], "成员课程")

    response = client.post(
        "/api/v1/courses/bulk-archive",
        headers=member["headers"],
        json={"ids": [course_id], "archived": True},
    )

    assert response.status_code == 200
    assert response.json()["updated"] == 1
