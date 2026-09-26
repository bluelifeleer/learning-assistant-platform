import json
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
from app.models.entities import Chapter, Course, Membership, Site, TranscriptSegment
from app.services import ai_tasks, llm
from app.services.plugins import ensure_default_organization

CHAPTER_SUMMARY = {
    "summary_md": "# 章节摘要\n本章讲解核心概念。",
    "outline": [{"title": "导论", "start_mmss": "00:00"}],
    "key_points": ["概念一", "概念二"],
}
COURSE_SUMMARY = {
    "summary_md": "# 课程摘要\n课程总览。",
    "outline": [{"title": "第一章", "start_mmss": ""}],
    "key_points": ["课程要点"],
}
QUIZ_ITEMS = [
    {"question_type": "choice", "question": "概念0是什么?", "options": ["甲", "乙", "丙", "丁"], "answer": "甲", "explanation": "字幕所述"},
    {"question_type": "truefalse", "question": "概念1是重点吗?", "answer": "正确", "explanation": "是的"},
]
FLASHCARDS = [{"front": "概念0是什么?", "back": "字幕中的定义"}]


def fake_chat_completion(config, messages, json_mode: bool = True) -> str:
    content = messages[-1]["content"]
    if "聚合成课程级学习摘要" in content:
        return json.dumps(COURSE_SUMMARY, ensure_ascii=False)
    if "记忆闪卡" in content:
        return json.dumps(FLASHCARDS, ensure_ascii=False)
    if "道题" in content:
        return json.dumps(QUIZ_ITEMS, ensure_ascii=False)
    return json.dumps(CHAPTER_SUMMARY, ensure_ascii=False)


@pytest.fixture
def ai_client(monkeypatch) -> Generator[tuple[TestClient, sessionmaker], None, None]:
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
    monkeypatch.setattr(ai_tasks, "SessionLocal", TestingSessionLocal)
    monkeypatch.setattr(llm, "chat_completion", fake_chat_completion)
    with TestClient(app) as test_client:
        yield test_client, TestingSessionLocal
    app.dependency_overrides.clear()
    Base.metadata.drop_all(engine)


def register_headers(client: TestClient, session_factory=None) -> dict[str, str]:
    response = client.post(
        "/api/v1/auth/register",
        json={"email": "ai-user@example.com", "password": "secret123", "display_name": "AI User"},
    )
    assert response.status_code == 200
    body = response.json()
    if session_factory is not None:
        db = session_factory()
        try:
            membership = db.query(Membership).filter(Membership.user_id == body["user"]["id"]).first()
            if membership:
                membership.role = "owner"
                db.commit()
        finally:
            db.close()
    return {"Authorization": f"Bearer {body['token']}"}


def configure_llm(client: TestClient, headers: dict[str, str], auto_generate: bool = False) -> None:
    response = client.put(
        "/api/v1/ai/settings",
        headers=headers,
        json={
            "llm_base_url": "https://llm.example.com/v1",
            "llm_api_key": "sk-abcdef123456",
            "llm_model": "test-model",
            "ai_auto_generate": auto_generate,
        },
    )
    assert response.status_code == 200


def seed_course_with_transcript(session_factory, segment_count: int = 25) -> dict[str, str]:
    db = session_factory()
    try:
        organization = ensure_default_organization(db)
        site = Site(adapter_id="adapter-1", name="Adapter", host_patterns={}, status="enabled")
        db.add(site)
        db.flush()
        course = Course(organization_id=organization.id, site_id=site.id, external_course_id="c1", title="测试课程")
        db.add(course)
        db.flush()
        chapter = Chapter(course_id=course.id, external_chapter_id="1.1", title="第一章 导论", sort_order=1)
        db.add(chapter)
        db.flush()
        for index in range(segment_count):
            db.add(
                TranscriptSegment(
                    course_id=course.id,
                    chapter_id=chapter.id,
                    start_seconds=index * 10,
                    end_seconds=index * 10 + 8,
                    text=f"第{index}段字幕",
                    source="dom-visible-text",
                )
            )
        db.commit()
        return {"course_id": course.id, "chapter_id": chapter.id}
    finally:
        db.close()


def test_ai_settings_mask_and_update(ai_client) -> None:
    client, session_factory = ai_client
    headers = register_headers(client, session_factory)

    initial = client.get("/api/v1/ai/settings", headers=headers)
    assert initial.status_code == 200
    assert initial.json() == {
        "llm_base_url": None,
        "llm_model": None,
        "llm_vision_model": None,
        "api_key_masked": None,
        "configured": False,
        "ai_auto_generate": False,
    }

    configure_llm(client, headers)
    masked = client.get("/api/v1/ai/settings", headers=headers).json()
    assert masked["api_key_masked"] == "sk-****3456"
    assert masked["configured"] is True
    assert "abcdef" not in str(masked)

    # 不传 api_key = 不修改
    client.put("/api/v1/ai/settings", headers=headers, json={"llm_model": "new-model"})
    updated = client.get("/api/v1/ai/settings", headers=headers).json()
    assert updated["llm_model"] == "new-model"
    assert updated["api_key_masked"] == "sk-****3456"
    assert updated["configured"] is True

    # 传空字符串 = 清除
    client.put("/api/v1/ai/settings", headers=headers, json={"llm_api_key": ""})
    cleared = client.get("/api/v1/ai/settings", headers=headers).json()
    assert cleared["api_key_masked"] is None
    assert cleared["configured"] is False


def test_ai_settings_test_endpoint(ai_client, monkeypatch) -> None:
    client, session_factory = ai_client
    headers = register_headers(client, session_factory)
    monkeypatch.setattr(llm, "test_connection", lambda config: None)
    configure_llm(client, headers)

    response = client.post("/api/v1/ai/settings/test", headers=headers)

    assert response.status_code == 200
    assert response.json() == {"ok": True, "detail": None}


def test_ai_settings_test_requires_configuration(ai_client) -> None:
    client, session_factory = ai_client
    headers = register_headers(client, session_factory)
    response = client.post("/api/v1/ai/settings/test", headers=headers)
    assert response.status_code == 400


def test_ai_routes_require_auth(ai_client) -> None:
    client, session_factory = ai_client
    assert client.get("/api/v1/ai/settings").status_code == 401
    assert client.post("/api/v1/ai/summary/chapter/x").status_code == 401
    assert client.post("/api/v1/ai/quiz", json={"chapter_id": "x"}).status_code == 401
    assert client.get("/api/v1/ai/tasks/x").status_code == 401


def test_chapter_summary_task_completes(ai_client) -> None:
    client, session_factory = ai_client
    headers = register_headers(client, session_factory)
    configure_llm(client, headers)
    ids = seed_course_with_transcript(session_factory)

    created = client.post(f"/api/v1/ai/summary/chapter/{ids['chapter_id']}", headers=headers)
    assert created.status_code == 200
    task_id = created.json()["task_id"]

    task = client.get(f"/api/v1/ai/tasks/{task_id}", headers=headers).json()
    assert task["status"] == "done"
    assert task["task_type"] == "chapter_summary"
    assert task["result_count"] == 1
    assert task["error"] is None

    summary = client.get(f"/api/v1/ai/summary/chapter/{ids['chapter_id']}", headers=headers)
    assert summary.status_code == 200
    assert summary.json()["summary_md"] == CHAPTER_SUMMARY["summary_md"]
    assert summary.json()["key_points"] == CHAPTER_SUMMARY["key_points"]


def test_task_creation_dedupes_pending_tasks(ai_client, monkeypatch) -> None:
    client, session_factory = ai_client
    headers = register_headers(client, session_factory)
    configure_llm(client, headers)
    ids = seed_course_with_transcript(session_factory)
    monkeypatch.setattr(ai_tasks, "run_ai_task", lambda *args, **kwargs: None)

    first = client.post(f"/api/v1/ai/summary/chapter/{ids['chapter_id']}", headers=headers).json()
    second = client.post(f"/api/v1/ai/summary/chapter/{ids['chapter_id']}", headers=headers).json()

    assert first["task_id"] == second["task_id"]
    assert second["status"] == "pending"


def test_failed_task_records_error(ai_client, monkeypatch) -> None:
    client, session_factory = ai_client
    headers = register_headers(client, session_factory)
    configure_llm(client, headers)
    ids = seed_course_with_transcript(session_factory)

    def broken_llm(config, messages, json_mode: bool = True) -> str:
        raise llm.LLMRequestError("LLM 请求失败: HTTP 500")

    monkeypatch.setattr(llm, "chat_completion", broken_llm)
    task_id = client.post(f"/api/v1/ai/summary/chapter/{ids['chapter_id']}", headers=headers).json()["task_id"]

    task = client.get(f"/api/v1/ai/tasks/{task_id}", headers=headers).json()
    assert task["status"] == "failed"
    assert "HTTP 500" in task["error"]
    assert client.get(f"/api/v1/ai/summary/chapter/{ids['chapter_id']}", headers=headers).status_code == 404


def test_quiz_flow(ai_client) -> None:
    client, session_factory = ai_client
    headers = register_headers(client, session_factory)
    configure_llm(client, headers)
    ids = seed_course_with_transcript(session_factory)

    task_id = client.post("/api/v1/ai/quiz", headers=headers, json={"chapter_id": ids["chapter_id"], "count": 2}).json()["task_id"]
    task = client.get(f"/api/v1/ai/tasks/{task_id}", headers=headers).json()
    assert task["status"] == "done"
    assert task["result_count"] == 2

    questions = client.get(f"/api/v1/ai/quiz?chapter_id={ids['chapter_id']}", headers=headers).json()["items"]
    assert len(questions) == 2
    assert {question["question_type"] for question in questions} == {"choice", "truefalse"}
    assert all(question["answer"] for question in questions)

    by_course = client.get(f"/api/v1/ai/quiz?course_id={ids['course_id']}", headers=headers).json()["items"]
    assert len(by_course) == 2
    assert client.get("/api/v1/ai/quiz", headers=headers).status_code == 422


def test_flashcards_flow_creates_due_review_cards(ai_client) -> None:
    client, session_factory = ai_client
    headers = register_headers(client, session_factory)
    configure_llm(client, headers)
    ids = seed_course_with_transcript(session_factory)

    task_id = client.post("/api/v1/ai/flashcards", headers=headers, json={"chapter_id": ids["chapter_id"], "count": 1}).json()["task_id"]
    task = client.get(f"/api/v1/ai/tasks/{task_id}", headers=headers).json()
    assert task["status"] == "done"
    assert task["result_count"] == 1

    due = client.get("/api/v1/review/due", headers=headers).json()["items"]
    ai_cards = [card for card in due if card["front"].startswith("[AI] ")]
    assert len(ai_cards) == 1
    assert ai_cards[0]["note_id"] is None
    assert ai_cards[0]["chapter_id"] == ids["chapter_id"]


def test_course_summary_task(ai_client) -> None:
    client, session_factory = ai_client
    headers = register_headers(client, session_factory)
    configure_llm(client, headers)
    ids = seed_course_with_transcript(session_factory)
    client.post(f"/api/v1/ai/summary/chapter/{ids['chapter_id']}", headers=headers)

    task_id = client.post(f"/api/v1/ai/summary/course/{ids['course_id']}", headers=headers).json()["task_id"]
    task = client.get(f"/api/v1/ai/tasks/{task_id}", headers=headers).json()
    assert task["status"] == "done"

    summary = client.get(f"/api/v1/ai/summary/course/{ids['course_id']}", headers=headers)
    assert summary.status_code == 200
    assert summary.json()["summary_md"] == COURSE_SUMMARY["summary_md"]


def capture_course(client: TestClient, headers: dict[str, str], segment_count: int, text_prefix: str = "自动字幕") -> dict[str, str]:
    token = client.post("/api/v1/plugin-tokens", json={"name": "Edge local"}, headers=headers).json()["token"]
    plugin_headers = {"Authorization": f"Bearer {token}"}
    snapshot = client.post(
        "/api/v1/capture/course-snapshot",
        headers=plugin_headers,
        json={
            "adapter_id": "wencai-school",
            "site_url": "https://learning.example.com/",
            "external_course_id": "course-1",
            "course_title": "自动课程",
            "chapters": [{"external_chapter_id": "1.1", "title": "1.1 自动章节", "sort_order": 1, "children": []}],
        },
    )
    assert snapshot.status_code == 200
    for index in range(segment_count):
        response = client.post(
            "/api/v1/capture/transcript-segment",
            headers=plugin_headers,
            json={
                "external_course_id": "course-1",
                "external_chapter_id": "1.1",
                "text": f"{text_prefix}第{index}段",
                "source": "dom-visible-text",
                "start_seconds": index * 10,
                "end_seconds": index * 10 + 8,
            },
        )
        assert response.status_code == 200
    return {"course_id": snapshot.json()["course_id"], "plugin_headers": plugin_headers}


def test_auto_generate_triggers_on_transcript_threshold(ai_client) -> None:
    client, session_factory = ai_client
    headers = register_headers(client, session_factory)
    configure_llm(client, headers, auto_generate=True)

    # 不足 20 段不触发
    capture_course(client, headers, segment_count=19)
    db = session_factory()
    try:
        assert db.query(entities.AiTask).count() == 0
    finally:
        db.close()

    # 达到 20 段触发章节摘要,并链式生成课程摘要
    result = capture_course(client, headers, segment_count=1, text_prefix="补充字幕")
    db = session_factory()
    try:
        chapter = db.query(Chapter).filter(Chapter.course_id == result["course_id"]).one()
        chapter_id = chapter.id
        tasks = db.query(entities.AiTask).order_by(entities.AiTask.created_at.asc()).all()
        assert [task.task_type for task in tasks] == ["chapter_summary", "course_summary"]
        assert all(task.status == "done" for task in tasks)
    finally:
        db.close()

    summary = client.get(f"/api/v1/ai/summary/chapter/{chapter_id}", headers=headers)
    assert summary.status_code == 200
    course_summary = client.get(f"/api/v1/ai/summary/course/{result['course_id']}", headers=headers)
    assert course_summary.status_code == 200


def test_auto_generate_stays_off_when_disabled(ai_client) -> None:
    client, session_factory = ai_client
    headers = register_headers(client, session_factory)
    configure_llm(client, headers, auto_generate=False)

    capture_course(client, headers, segment_count=25)

    db = session_factory()
    try:
        assert db.query(entities.AiTask).count() == 0
    finally:
        db.close()


def test_auto_generate_requires_llm_configuration(ai_client) -> None:
    client, session_factory = ai_client
    headers = register_headers(client, session_factory)
    # 只开开关,不配 LLM
    response = client.put("/api/v1/ai/settings", headers=headers, json={"ai_auto_generate": True})
    assert response.status_code == 200

    capture_course(client, headers, segment_count=25)

    db = session_factory()
    try:
        assert db.query(entities.AiTask).count() == 0
    finally:
        db.close()
