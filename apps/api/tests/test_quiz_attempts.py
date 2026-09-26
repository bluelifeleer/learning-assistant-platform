from collections.abc import Generator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.db.base import Base
from app.db.session import get_db
from app.main import create_app
from app.models import entities  # noqa: F401 - register models
from app.models.entities import Chapter, Course, QuizQuestion, Site
from app.services.plugins import ensure_default_organization


@pytest.fixture
def quiz_client() -> Generator[tuple[TestClient, sessionmaker], None, None]:
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


def register_headers(client: TestClient, email: str = "quiz-user@example.com") -> dict[str, str]:
    response = client.post(
        "/api/v1/auth/register",
        json={"email": email, "password": "secret123", "display_name": "Quiz User"},
    )
    assert response.status_code == 200
    return {"Authorization": f"Bearer {response.json()['token']}"}


def seed_course(session_factory, external_id: str = "c1", title: str = "测试课程") -> dict:
    db = session_factory()
    try:
        organization = ensure_default_organization(db)
        site = Site(adapter_id=f"adapter-{external_id}", name="Adapter", host_patterns={}, status="enabled")
        db.add(site)
        db.flush()
        course = Course(organization_id=organization.id, site_id=site.id, external_course_id=external_id, title=title)
        db.add(course)
        db.flush()
        chapter_one = Chapter(course_id=course.id, external_chapter_id=f"{external_id}-1.1", title="第一章 导论", sort_order=1)
        chapter_two = Chapter(course_id=course.id, external_chapter_id=f"{external_id}-1.2", title="第二章 进阶", sort_order=2)
        db.add_all([chapter_one, chapter_two])
        db.flush()
        questions = []
        for index, chapter in enumerate((chapter_one, chapter_one, chapter_two)):
            question = QuizQuestion(
                course_id=course.id,
                chapter_id=chapter.id,
                question_type="choice",
                question=f"问题{index}?",
                options=["甲", "乙", "丙", "丁"],
                answer="甲",
                explanation="解析",
                model="test-model",
            )
            db.add(question)
            questions.append(question)
        db.commit()
        return {
            "organization_id": organization.id,
            "course_id": course.id,
            "chapter_one_id": chapter_one.id,
            "chapter_two_id": chapter_two.id,
            "question_ids": [question.id for question in questions],
        }
    finally:
        db.close()


def test_record_attempts_skips_unknown_questions(quiz_client) -> None:
    client, session_factory = quiz_client
    headers = register_headers(client)
    ids = seed_course(session_factory)

    response = client.post(
        "/api/v1/quiz/attempts",
        headers=headers,
        json={
            "items": [
                {"question_id": ids["question_ids"][0], "chosen": "甲", "correct": True},
                {"question_id": ids["question_ids"][1], "chosen": "乙", "correct": False},
                {"question_id": "no-such-question", "chosen": "甲", "correct": True},
            ]
        },
    )

    assert response.status_code == 200
    assert response.json() == {"recorded": 2}


def test_record_attempts_grades_server_side_ignoring_client_correct(quiz_client) -> None:
    client, session_factory = quiz_client
    headers = register_headers(client)
    ids = seed_course(session_factory)

    # 客户端谎报 correct=false,但 chosen="甲" 恰是正确答案,服务端应按真实答案判为正确
    response = client.post(
        "/api/v1/quiz/attempts",
        headers=headers,
        json={"items": [{"question_id": ids["question_ids"][0], "chosen": "甲", "correct": False}]},
    )
    assert response.status_code == 200

    mastery = client.get("/api/v1/stats/mastery", headers=headers).json()
    assert mastery["items"][0]["correct"] == 1
    assert mastery["items"][0]["total"] == 1
    assert mastery["items"][0]["accuracy"] == 100.0


def test_record_attempts_validates_batch_size(quiz_client) -> None:
    client, _ = quiz_client
    headers = register_headers(client)

    empty = client.post("/api/v1/quiz/attempts", headers=headers, json={"items": []})
    assert empty.status_code == 422
    too_many = client.post(
        "/api/v1/quiz/attempts",
        headers=headers,
        json={"items": [{"question_id": "q", "chosen": "a", "correct": True}] * 101},
    )
    assert too_many.status_code == 422


def test_mastery_aggregates_accuracy_and_orders_by_sort_order(quiz_client) -> None:
    client, session_factory = quiz_client
    headers = register_headers(client)
    ids = seed_course(session_factory)
    client.post(
        "/api/v1/quiz/attempts",
        headers=headers,
        json={
            "items": [
                {"question_id": ids["question_ids"][2], "chosen": "甲", "correct": True},
                {"question_id": ids["question_ids"][0], "chosen": "甲", "correct": True},
                {"question_id": ids["question_ids"][1], "chosen": "乙", "correct": False},
            ]
        },
    )

    response = client.get("/api/v1/stats/mastery", headers=headers)

    assert response.status_code == 200
    items = response.json()["items"]
    assert [item["chapter_id"] for item in items] == [ids["chapter_one_id"], ids["chapter_two_id"]]
    first, second = items
    assert first["course_title"] == "测试课程"
    assert first["chapter_title"] == "第一章 导论"
    assert first["total"] == 2
    assert first["correct"] == 1
    assert first["accuracy"] == 50.0
    assert first["last_attempt_at"] is not None
    assert second["total"] == 1
    assert second["correct"] == 1
    assert second["accuracy"] == 100.0


def test_mastery_only_counts_current_user(quiz_client) -> None:
    client, session_factory = quiz_client
    headers_one = register_headers(client, "user-one@example.com")
    headers_two = register_headers(client, "user-two@example.com")
    ids = seed_course(session_factory)
    client.post(
        "/api/v1/quiz/attempts",
        headers=headers_two,
        json={"items": [{"question_id": ids["question_ids"][0], "chosen": "乙", "correct": False}]},
    )

    response = client.get("/api/v1/stats/mastery", headers=headers_one)

    assert response.status_code == 200
    assert response.json()["items"] == []


def test_mastery_course_filter_and_404(quiz_client) -> None:
    client, session_factory = quiz_client
    headers = register_headers(client)
    ids_one = seed_course(session_factory, external_id="c1", title="课程一")
    ids_two = seed_course(session_factory, external_id="c2", title="课程二")
    for ids in (ids_one, ids_two):
        client.post(
            "/api/v1/quiz/attempts",
            headers=headers,
            json={"items": [{"question_id": ids["question_ids"][0], "chosen": "甲", "correct": True}]},
        )

    filtered = client.get(f"/api/v1/stats/mastery?course_id={ids_one['course_id']}", headers=headers)
    assert filtered.status_code == 200
    items = filtered.json()["items"]
    assert len(items) == 1
    assert items[0]["course_id"] == ids_one["course_id"]
    assert items[0]["course_title"] == "课程一"

    missing = client.get("/api/v1/stats/mastery?course_id=no-such-course", headers=headers)
    assert missing.status_code == 404


def test_quiz_endpoints_require_auth(quiz_client) -> None:
    client, _ = quiz_client

    assert client.post("/api/v1/quiz/attempts", json={"items": [{"question_id": "q", "chosen": "a", "correct": True}]}).status_code == 401
    assert client.get("/api/v1/stats/mastery").status_code == 401
