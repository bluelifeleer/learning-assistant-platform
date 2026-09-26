from collections.abc import Generator
from datetime import datetime, timedelta
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.db.base import Base
from app.db.session import get_db
from app.main import create_app
from app.models import entities  # noqa: F401 - register models
from app.models.entities import Chapter, ChapterSummary, Course, Membership, Note, QuizQuestion, Screenshot, Site, TranscriptSegment, VideoSession
from app.services import llm
from app.services.plugins import ensure_default_organization


@pytest.fixture
def progress_client() -> Generator[tuple[TestClient, sessionmaker], None, None]:
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


def register_headers(client: TestClient, session_factory=None, email: str | None = None) -> dict[str, str]:
    response = client.post(
        "/api/v1/auth/register",
        json={"email": email or f"user-{uuid4().hex[:8]}@example.com", "password": "secret123", "display_name": "User"},
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


def seed_course_tree(session_factory, leaf_count: int = 2) -> dict:
    """一门课:一个父章 + 若干叶子节"""
    db = session_factory()
    try:
        organization = ensure_default_organization(db)
        site = Site(adapter_id=f"adapter-{uuid4().hex[:6]}", name="Adapter", host_patterns={}, status="enabled")
        db.add(site)
        db.flush()
        course = Course(organization_id=organization.id, site_id=site.id, external_course_id=uuid4().hex[:8], title="党史课")
        db.add(course)
        db.flush()
        parent = Chapter(course_id=course.id, external_chapter_id="ch1", title="第一章", sort_order=1)
        db.add(parent)
        db.flush()
        leaves = []
        for index in range(leaf_count):
            leaf = Chapter(
                course_id=course.id,
                parent_id=parent.id,
                external_chapter_id=f"ch1-{index + 1}",
                title=f"1.{index + 1}小节",
                sort_order=index + 1,
            )
            db.add(leaf)
            db.flush()
            leaves.append(leaf)
        db.commit()
        return {"course_id": course.id, "org_id": organization.id, "parent_id": parent.id, "leaf_ids": [leaf.id for leaf in leaves]}
    finally:
        db.close()


def configure_llm(session_factory) -> None:
    db = session_factory()
    try:
        organization = ensure_default_organization(db)
        organization.llm_base_url = "https://llm.example.com/v1"
        organization.llm_api_key = "sk-test"
        organization.llm_model = "chat-model"
        db.commit()
    finally:
        db.close()


def test_learning_progress_empty(progress_client) -> None:
    client, session_factory = progress_client
    headers = register_headers(client, session_factory)
    response = client.get("/api/v1/stats/learning-progress", headers=headers)
    assert response.status_code == 200
    data = response.json()
    assert data["streak_days"] == 0
    assert data["week_minutes"] == 0
    assert data["weekly_goal_minutes"] == 300
    assert data["continue_learning"] is None
    assert data["courses"] == []


def test_learning_progress_counts_study_and_streak(progress_client) -> None:
    client, session_factory = progress_client
    headers = register_headers(client, session_factory)
    ids = seed_course_tree(session_factory, leaf_count=2)
    # 当前用户:第一节有播放会话(本周、今天),第二节有截图
    db = session_factory()
    try:
        from app.models.entities import User

        user = db.query(User).first()
        db.add(VideoSession(course_id=ids["course_id"], chapter_id=ids["leaf_ids"][0], user_id=user.id, source_url="http://x", duration_watched_seconds=1800))
        db.add(Screenshot(organization_id=ids["org_id"], course_id=ids["course_id"], chapter_id=ids["leaf_ids"][1], user_id=user.id, file_path="/tmp/x.png"))
        db.commit()
    finally:
        db.close()

    data = client.get("/api/v1/stats/learning-progress", headers=headers).json()
    assert data["week_minutes"] == 30
    assert data["streak_days"] == 1
    assert data["courses"][0]["total_chapters"] == 2
    assert data["courses"][0]["studied_chapters"] == 2
    assert data["courses"][0]["progress_pct"] == 100.0
    assert data["continue_learning"]["chapter_id"] == ids["leaf_ids"][0]


def test_learning_progress_streak_across_days(progress_client) -> None:
    client, session_factory = progress_client
    headers = register_headers(client, session_factory)
    ids = seed_course_tree(session_factory)
    db = session_factory()
    try:
        from app.models.entities import User

        user = db.query(User).first()
        for days_ago in (0, 1, 2, 4):  # 第 3 天断开
            session = VideoSession(
                course_id=ids["course_id"],
                chapter_id=ids["leaf_ids"][0],
                user_id=user.id,
                source_url="http://x",
                duration_watched_seconds=60,
            )
            db.add(session)
            db.flush()
            session.started_at = datetime.now() - timedelta(days=days_ago)
        db.commit()
    finally:
        db.close()
    data = client.get("/api/v1/stats/learning-progress", headers=headers).json()
    assert data["streak_days"] == 3


def test_settings_weekly_goal_roundtrip(progress_client) -> None:
    client, session_factory = progress_client
    headers = register_headers(client, session_factory)
    assert client.get("/api/v1/settings", headers=headers).json()["weekly_goal_minutes"] == 300
    updated = client.put("/api/v1/settings", headers=headers, json={"weekly_goal_minutes": 600})
    assert updated.status_code == 200
    assert updated.json()["weekly_goal_minutes"] == 600
    assert client.put("/api/v1/settings", headers=headers, json={"weekly_goal_minutes": 5}).status_code == 422


def test_course_detail_flags(progress_client) -> None:
    client, session_factory = progress_client
    headers = register_headers(client, session_factory)
    ids = seed_course_tree(session_factory, leaf_count=2)
    db = session_factory()
    try:
        from app.models.entities import User

        user = db.query(User).first()
        leaf = ids["leaf_ids"][0]
        db.add(TranscriptSegment(course_id=ids["course_id"], chapter_id=leaf, text="字幕", source="page"))
        db.add(Note(course_id=ids["course_id"], chapter_id=leaf, user_id=user.id, content="笔记"))
        db.add(ChapterSummary(chapter_id=leaf, course_id=ids["course_id"], summary_md="摘要", outline=[], key_points=[], model="m", status="done"))
        db.add(QuizQuestion(course_id=ids["course_id"], chapter_id=leaf, question_type="choice", question="q", options=["a", "b"], answer="a", model="m"))
        db.commit()
    finally:
        db.close()

    data = client.get(f"/api/v1/courses/{ids['course_id']}/detail", headers=headers).json()
    parent = data["chapters"][0]
    leaf_with_all, leaf_empty = parent["children"]
    assert leaf_with_all["flags"] == {"has_transcript": True, "has_notes": True, "has_summary": True, "has_quiz": True, "studied": True}
    assert leaf_empty["flags"] == {"has_transcript": False, "has_notes": False, "has_summary": False, "has_quiz": False, "studied": False}
    assert parent["flags"]["has_transcript"] is False


def test_notes_filter_by_course_and_tag(progress_client) -> None:
    client, session_factory = progress_client
    headers = register_headers(client, session_factory)
    ids = seed_course_tree(session_factory)
    other = seed_course_tree(session_factory)
    client.post("/api/v1/notes", headers=headers, json={"course_id": ids["course_id"], "chapter_id": ids["leaf_ids"][0], "content": "重点笔记", "tags": ["考点"]})
    client.post("/api/v1/notes", headers=headers, json={"course_id": other["course_id"], "chapter_id": other["leaf_ids"][0], "content": "其他课程", "tags": []})

    all_notes = client.get("/api/v1/notes", headers=headers).json()["items"]
    assert len(all_notes) == 2
    filtered = client.get(f"/api/v1/notes?course_id={ids['course_id']}", headers=headers).json()["items"]
    assert len(filtered) == 1 and filtered[0]["course_id"] == ids["course_id"]
    tagged = client.get("/api/v1/notes?tag=考点", headers=headers).json()["items"]
    assert len(tagged) == 1 and tagged[0]["content"] == "重点笔记"
    assert client.get("/api/v1/notes?tag=简答", headers=headers).json()["items"] == []


def _seed_screenshots(session_factory, ids: dict, tmp_path, count: int = 2) -> list[str]:
    db = session_factory()
    try:
        from app.models.entities import User

        user = db.query(User).first()
        screenshot_ids = []
        for index in range(count):
            image = tmp_path / f"shot-{index}.png"
            image.write_bytes(b"\x89PNG\r\n\x1a\n" + bytes(16))
            screenshot = Screenshot(
                organization_id=ids["org_id"],
                course_id=ids["course_id"],
                chapter_id=ids["leaf_ids"][0],
                user_id=user.id,
                video_time_seconds=float(index * 60),
                file_path=str(image),
            )
            db.add(screenshot)
            db.flush()
            screenshot_ids.append(screenshot.id)
        db.commit()
        return screenshot_ids
    finally:
        db.close()


def test_chapter_ocr_requires_llm(progress_client, tmp_path) -> None:
    client, session_factory = progress_client
    headers = register_headers(client, session_factory)
    ids = seed_course_tree(session_factory)
    _seed_screenshots(session_factory, ids, tmp_path)
    response = client.post(f"/api/v1/ai/ocr/chapter/{ids['leaf_ids'][0]}", headers=headers)
    assert response.status_code == 400


def test_chapter_ocr_requires_screenshots(progress_client) -> None:
    client, session_factory = progress_client
    headers = register_headers(client, session_factory)
    ids = seed_course_tree(session_factory)
    configure_llm(session_factory)
    response = client.post(f"/api/v1/ai/ocr/chapter/{ids['leaf_ids'][0]}", headers=headers)
    assert response.status_code == 422


def test_chapter_ocr_writes_transcript_segments_idempotent(progress_client, tmp_path, monkeypatch) -> None:
    client, session_factory = progress_client
    headers = register_headers(client, session_factory)
    ids = seed_course_tree(session_factory)
    configure_llm(session_factory)
    _seed_screenshots(session_factory, ids, tmp_path, count=2)
    monkeypatch.setattr(llm, "chat_completion_vision", lambda config, prompt, images, model_override=None: "识别出的课件文字")

    response = client.post(f"/api/v1/ai/ocr/chapter/{ids['leaf_ids'][0]}", headers=headers)
    assert response.status_code == 200
    task_id = response.json()["task_id"]

    from app.services import ai_tasks

    db = session_factory()
    try:
        ai_tasks.run_ai_task(task_id, session_factory=session_factory)
        segments = db.query(TranscriptSegment).filter(TranscriptSegment.source == "ocr").all()
        assert len(segments) == 2
        assert all(segment.text == "识别出的课件文字" for segment in segments)
        # 截图缓存已写回
        assert db.query(Screenshot).filter(Screenshot.ocr_text.isnot(None)).count() == 2
    finally:
        db.close()

    # 幂等:再跑一次不新增
    ai_tasks.run_ai_task(task_id, session_factory=session_factory)
    db = session_factory()
    try:
        assert db.query(TranscriptSegment).filter(TranscriptSegment.source == "ocr").count() == 2
    finally:
        db.close()


def test_screenshot_ocr_sync(progress_client, tmp_path, monkeypatch) -> None:
    client, session_factory = progress_client
    headers = register_headers(client, session_factory)
    ids = seed_course_tree(session_factory)
    configure_llm(session_factory)
    screenshot_ids = _seed_screenshots(session_factory, ids, tmp_path, count=1)
    monkeypatch.setattr(llm, "chat_completion_vision", lambda config, prompt, images, model_override=None: "单张识别文字")

    response = client.post(f"/api/v1/ai/ocr/screenshot/{screenshot_ids[0]}", headers=headers)
    assert response.status_code == 200
    assert response.json() == {"ok": True, "ocr_text": "单张识别文字", "cached": False}
    again = client.post(f"/api/v1/ai/ocr/screenshot/{screenshot_ids[0]}", headers=headers)
    assert again.json()["cached"] is True
    # 列表接口带 ocr_text
    items = client.get(f"/api/v1/screenshots?course_id={ids['course_id']}", headers=headers).json()["items"]
    assert items[0]["ocr_text"] == "单张识别文字"


def test_ai_settings_vision_model_roundtrip(progress_client) -> None:
    client, session_factory = progress_client
    headers = register_headers(client, session_factory)
    response = client.put(
        "/api/v1/ai/settings",
        headers=headers,
        json={"llm_base_url": "https://llm.example.com/v1", "llm_api_key": "sk-x", "llm_model": "chat", "llm_vision_model": "vision-pro"},
    )
    assert response.status_code == 200
    assert response.json()["llm_vision_model"] == "vision-pro"
    cleared = client.put("/api/v1/ai/settings", headers=headers, json={"llm_vision_model": ""})
    assert cleared.json()["llm_vision_model"] is None
