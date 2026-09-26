from collections.abc import Generator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.db.base import Base
from app.db.session import get_db
from app.main import create_app
from app.models import entities  # noqa: F401 - register models
from app.models.entities import Chapter, ChapterSummary, Course, Note, QuizAttempt, QuizQuestion, Screenshot, Site, VideoSession
from app.services.plugins import ensure_default_organization


@pytest.fixture
def report_client() -> Generator[tuple[TestClient, sessionmaker], None, None]:
    engine = create_engine(
        "sqlite+pysqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    TestingSessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)
    Base.metadata.create_all(engine)
    app = create_app()

    def override_get_db() -> Generator:
        db = TestingSessionLocal()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as test_client:
        yield test_client, TestingSessionLocal
    app.dependency_overrides.clear()
    Base.metadata.drop_all(engine)


def register_headers(client: TestClient) -> tuple[dict[str, str], str]:
    response = client.post(
        "/api/v1/auth/register",
        json={"email": "report-user@example.com", "password": "secret123", "display_name": "Report User"},
    )
    assert response.status_code == 200
    body = response.json()
    return {"Authorization": f"Bearer {body['token']}"}, body["user"]["id"]


def seed_course(session_factory, user_id: str, external_id: str = "c1", title: str = "供应链管理", with_data: bool = True) -> dict:
    db = session_factory()
    try:
        organization = ensure_default_organization(db)
        site = Site(adapter_id=f"adapter-{external_id}", name="Adapter", host_patterns={}, status="enabled")
        db.add(site)
        db.flush()
        course = Course(organization_id=organization.id, site_id=site.id, external_course_id=external_id, title=title)
        db.add(course)
        db.flush()
        chapter = Chapter(course_id=course.id, external_chapter_id=f"{external_id}-1.1", title="第一章 导论", sort_order=1)
        db.add(chapter)
        db.flush()
        if with_data:
            db.add(
                VideoSession(
                    course_id=course.id,
                    chapter_id=chapter.id,
                    user_id=user_id,
                    duration_watched_seconds=600,
                    source_url="https://example.com/v",
                )
            )
            db.add(Note(course_id=course.id, chapter_id=chapter.id, user_id=user_id, video_time_seconds=12, content="关键概念"))
            db.add(
                Screenshot(
                    organization_id=organization.id,
                    course_id=course.id,
                    chapter_id=chapter.id,
                    user_id=user_id,
                    video_time_seconds=20,
                    file_path="screenshots/a.png",
                )
            )
            question = QuizQuestion(
                course_id=course.id,
                chapter_id=chapter.id,
                question_type="choice",
                question="问题?",
                options=["甲", "乙"],
                answer="甲",
                model="test-model",
            )
            db.add(question)
            db.flush()
            db.add(
                QuizAttempt(
                    organization_id=organization.id,
                    user_id=user_id,
                    question_id=question.id,
                    course_id=course.id,
                    chapter_id=chapter.id,
                    chosen="甲",
                    correct=True,
                )
            )
            db.add(
                ChapterSummary(
                    chapter_id=chapter.id,
                    course_id=course.id,
                    summary_md="# 摘要",
                    outline=[],
                    key_points=["重点一", "Key Point Two"],
                    model="test-model",
                    status="done",
                )
            )
        db.commit()
        return {"course_id": course.id, "chapter_id": chapter.id}
    finally:
        db.close()


def test_report_pdf_export_generates_file(report_client) -> None:
    client, session_factory = report_client
    headers, user_id = register_headers(client)
    ids = seed_course(session_factory, user_id)

    response = client.post("/api/v1/exports", headers=headers, json={"course_id": ids["course_id"], "export_format": "report_pdf"})

    assert response.status_code == 200
    assert response.json()["status"] == "completed"
    item = client.get("/api/v1/exports", headers=headers).json()["items"][0]
    assert item["format"] == "report_pdf"
    assert item["status"] == "completed"
    path = Path(item["file_path"])
    assert path.name.startswith(f"study-report-{ids['course_id']}-")
    assert path.suffix == ".pdf"
    content = path.read_bytes()
    assert content.startswith(b"%PDF")
    assert len(content) > 500
    download = client.get(f"/api/v1/exports/{item['id']}/download", headers=headers)
    assert download.status_code == 200
    assert download.headers["content-type"] == "application/pdf"
    assert download.content.startswith(b"%PDF")


def test_report_pdf_all_courses_includes_empty_course(report_client) -> None:
    client, session_factory = report_client
    headers, user_id = register_headers(client)
    seed_course(session_factory, user_id, external_id="c1", title="供应链管理")
    seed_course(session_factory, user_id, external_id="c2", title="English Course 101", with_data=False)

    response = client.post("/api/v1/exports", headers=headers, json={"export_format": "report_pdf"})

    assert response.status_code == 200
    assert response.json()["status"] == "completed"
    item = client.get("/api/v1/exports", headers=headers).json()["items"][0]
    path = Path(item["file_path"])
    assert path.name.startswith("study-report-all-")
    content = path.read_bytes()
    assert content.startswith(b"%PDF")
    assert len(content) > 500


def test_report_pdf_escapes_xml_metacharacters(report_client) -> None:
    client, session_factory = report_client
    headers, user_id = register_headers(client)
    ids = seed_course(session_factory, user_id, title="供应链 & <管理>")

    db = session_factory()
    try:
        summary = db.query(ChapterSummary).first()
        summary.key_points = ["重点 & <标签>"]
        db.commit()
    finally:
        db.close()

    response = client.post("/api/v1/exports", headers=headers, json={"course_id": ids["course_id"], "export_format": "report_pdf"})

    assert response.status_code == 200
    assert response.json()["status"] == "completed"


def test_report_pdf_course_not_found(report_client) -> None:
    client, _ = report_client
    headers, _ = register_headers(client)

    response = client.post("/api/v1/exports", headers=headers, json={"course_id": "no-such-course", "export_format": "report_pdf"})

    assert response.status_code == 404
