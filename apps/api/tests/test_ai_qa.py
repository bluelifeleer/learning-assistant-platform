from collections.abc import Generator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.db.base import Base
from app.db.session import get_db
from app.main import create_app
from app.models.entities import Chapter, ChapterSummary, Course, Membership, Site, TranscriptSegment
from app.services import ai_qa, llm
from app.services.plugins import ensure_default_organization

ANSWER_TEXT = "梯度下降是一种优化算法 [01:10],课程第一章有讲解。"


@pytest.fixture
def qa_client(monkeypatch) -> Generator[tuple[TestClient, sessionmaker], None, None]:
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
    monkeypatch.setattr(llm, "chat_completion", lambda config, messages, json_mode=True: ANSWER_TEXT)
    with TestClient(app) as test_client:
        yield test_client, TestingSessionLocal
    app.dependency_overrides.clear()
    Base.metadata.drop_all(engine)


def register_headers(client: TestClient, session_factory=None) -> dict[str, str]:
    response = client.post(
        "/api/v1/auth/register",
        json={"email": "qa-user@example.com", "password": "secret123", "display_name": "QA User"},
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


def configure_llm(client: TestClient, headers: dict[str, str]) -> None:
    response = client.put(
        "/api/v1/ai/settings",
        headers=headers,
        json={"llm_base_url": "https://llm.example.com/v1", "llm_api_key": "sk-abcdef123456", "llm_model": "test-model"},
    )
    assert response.status_code == 200


def seed_qa_course(session_factory) -> dict[str, str]:
    db = session_factory()
    try:
        organization = ensure_default_organization(db)
        site = Site(adapter_id="adapter-1", name="Adapter", host_patterns={}, status="enabled")
        db.add(site)
        db.flush()
        course = Course(organization_id=organization.id, site_id=site.id, external_course_id="c1", title="机器学习基础")
        db.add(course)
        db.flush()
        chapter_one = Chapter(course_id=course.id, external_chapter_id="1.1", title="第一章 梯度下降", sort_order=1)
        chapter_two = Chapter(course_id=course.id, external_chapter_id="1.2", title="第二章 正则化", sort_order=2)
        db.add_all([chapter_one, chapter_two])
        db.flush()
        chapter_one_texts = [
            "大家好,欢迎来到本门新课",
            "今天讲解梯度下降的基本原理",
            "梯度下降通过不断迭代更新参数",
            "学习率决定了梯度下降每一步的步长",
            "接下来我们看一个具体的例子",
        ]
        for index, text in enumerate(chapter_one_texts):
            db.add(
                TranscriptSegment(
                    course_id=course.id,
                    chapter_id=chapter_one.id,
                    start_seconds=index * 10,
                    end_seconds=index * 10 + 8,
                    text=text,
                    source="dom-visible-text",
                )
            )
        for index in range(3):
            db.add(
                TranscriptSegment(
                    course_id=course.id,
                    chapter_id=chapter_two.id,
                    start_seconds=index * 10,
                    end_seconds=index * 10 + 8,
                    text=f"正则化可以防止过拟合,第{index}部分",
                    source="dom-visible-text",
                )
            )
        db.commit()
        return {"course_id": course.id, "chapter_one_id": chapter_one.id, "chapter_two_id": chapter_two.id}
    finally:
        db.close()


def test_extract_terms_chinese_bigrams() -> None:
    terms = ai_qa.extract_terms("什么是机器学习?")
    assert "机器" in terms
    assert "器学" in terms
    assert "学习" in terms


def test_extract_terms_english_and_mixed() -> None:
    english = ai_qa.extract_terms("What is gradient descent?")
    assert "gradient" in english
    assert "descent" in english

    mixed = ai_qa.extract_terms("Python 的装饰器怎么用")
    assert "python" in mixed
    assert "装饰" in mixed
    assert "饰器" in mixed


def test_extract_terms_empty_and_stop_chars() -> None:
    assert ai_qa.extract_terms("") == []
    assert ai_qa.extract_terms("?!,. ") == []
    single = ai_qa.extract_terms("的")
    assert "的" not in single


def test_retrieve_scoring_and_neighborhood(qa_client) -> None:
    _, session_factory = qa_client
    ids = seed_qa_course(session_factory)
    db = session_factory()
    try:
        context, citations = ai_qa.retrieve_segments(db, ids["course_id"], None, "梯度下降的学习率怎么选")
        # 命中两段含"梯度"的段落,score=2 的(学习率段)排前
        assert citations
        assert all(citation.chapter_title == "第一章 梯度下降" for citation in citations)
        assert citations[0].text.startswith("学习率决定")
        assert citations[0].start_seconds == 30
        # 邻域扩展:首段不含检索词,但因落在命中段 ±30 秒内被并入上下文;命中段不重复
        assert context.count("梯度下降通过不断迭代更新参数") == 1
        assert "大家好,欢迎来到本门新课" in context
        assert context.startswith("### 章节:第一章 梯度下降")
        assert "[00:10]" in context
        # 第二章未命中,不出现在上下文
        assert "正则化" not in context
    finally:
        db.close()


def test_retrieve_scoped_to_single_chapter(qa_client) -> None:
    _, session_factory = qa_client
    ids = seed_qa_course(session_factory)
    db = session_factory()
    try:
        context, citations = ai_qa.retrieve_segments(db, ids["course_id"], ids["chapter_two_id"], "正则化")
        assert citations
        assert all(citation.chapter_id == ids["chapter_two_id"] for citation in citations)
        assert "梯度下降" not in context
    finally:
        db.close()


def test_retrieve_fallback_uses_summary_and_chapter_heads(qa_client) -> None:
    _, session_factory = qa_client
    ids = seed_qa_course(session_factory)
    db = session_factory()
    try:
        db.add(
            ChapterSummary(
                chapter_id=ids["chapter_one_id"],
                course_id=ids["course_id"],
                summary_md="本章讲解梯度下降原理与学习率选择。",
                outline=[],
                key_points=[],
                model="test-model",
            )
        )
        db.commit()
        context, citations = ai_qa.retrieve_segments(db, ids["course_id"], None, "完全无关的xyz话题")
        assert citations == []
        assert "章节摘要:本章讲解梯度下降原理与学习率选择。" in context
        assert "大家好,欢迎来到本门新课" in context
        assert "### 章节:第二章 正则化" in context
    finally:
        db.close()


def test_retrieve_context_truncated(qa_client, monkeypatch) -> None:
    _, session_factory = qa_client
    db = session_factory()
    try:
        organization = ensure_default_organization(db)
        site = Site(adapter_id="adapter-1", name="Adapter", host_patterns={}, status="enabled")
        db.add(site)
        db.flush()
        course = Course(organization_id=organization.id, site_id=site.id, external_course_id="c1", title="长字幕课程")
        db.add(course)
        db.flush()
        chapter = Chapter(course_id=course.id, external_chapter_id="1.1", title="长章节", sort_order=1)
        db.add(chapter)
        db.flush()
        for index in range(30):
            db.add(
                TranscriptSegment(
                    course_id=course.id,
                    chapter_id=chapter.id,
                    start_seconds=index * 5,
                    end_seconds=index * 5 + 4,
                    text=f"第{index}段" + "很长的字幕内容" * 60,
                    source="dom-visible-text",
                )
            )
        db.commit()
        context, _ = ai_qa.retrieve_segments(db, course.id, None, "很长的字幕内容")
        assert len(context) <= ai_qa.CONTEXT_MAX_CHARS + 100
        assert context
    finally:
        db.close()


def test_ask_endpoint_returns_answer_and_citations(qa_client, monkeypatch) -> None:
    client, session_factory = qa_client
    headers = register_headers(client, session_factory)
    configure_llm(client, headers)
    ids = seed_qa_course(session_factory)

    captured: dict = {}

    def recording_chat(config, messages, json_mode=True):
        captured["messages"] = messages
        captured["json_mode"] = json_mode
        return ANSWER_TEXT

    monkeypatch.setattr(llm, "chat_completion", recording_chat)
    response = client.post(
        "/api/v1/ai/ask",
        headers=headers,
        json={
            "course_id": ids["course_id"],
            "question": "梯度下降的学习率怎么选?",
            "history": [
                {"role": "user", "content": "之前的问题"},
                {"role": "assistant", "content": "之前的回答"},
            ],
        },
    )
    assert response.status_code == 200
    body = response.json()
    assert body["answer_md"] == ANSWER_TEXT
    assert body["citations"]
    first = body["citations"][0]
    assert first["chapter_id"] == ids["chapter_one_id"]
    assert first["chapter_title"] == "第一章 梯度下降"
    assert first["start_seconds"] == 30
    assert first["excerpt"].startswith("学习率决定")

    messages = captured["messages"]
    assert captured["json_mode"] is False
    assert messages[0]["role"] == "system"
    assert {"role": "user", "content": "之前的问题"} in messages
    assert {"role": "assistant", "content": "之前的回答"} in messages
    assert "梯度下降的学习率怎么选?" in messages[-1]["content"]
    assert "学习率决定了梯度下降每一步的步长" in messages[-1]["content"]


def test_ask_endpoint_chapter_scope(qa_client) -> None:
    client, session_factory = qa_client
    headers = register_headers(client, session_factory)
    configure_llm(client, headers)
    ids = seed_qa_course(session_factory)

    response = client.post(
        "/api/v1/ai/ask",
        headers=headers,
        json={"course_id": ids["course_id"], "chapter_id": ids["chapter_two_id"], "question": "正则化是什么"},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["citations"]
    assert all(citation["chapter_id"] == ids["chapter_two_id"] for citation in body["citations"])


def test_ask_endpoint_requires_llm_configuration(qa_client) -> None:
    client, session_factory = qa_client
    headers = register_headers(client, session_factory)
    ids = seed_qa_course(session_factory)

    response = client.post("/api/v1/ai/ask", headers=headers, json={"course_id": ids["course_id"], "question": "梯度下降"})
    assert response.status_code == 400


def test_ask_endpoint_422_without_transcript(qa_client) -> None:
    client, session_factory = qa_client
    headers = register_headers(client, session_factory)
    configure_llm(client, headers)
    ids = seed_qa_course(session_factory)

    db = session_factory()
    try:
        empty_chapter = Chapter(course_id=ids["course_id"], external_chapter_id="9.9", title="空章节", sort_order=9)
        db.add(empty_chapter)
        db.commit()
        empty_chapter_id = empty_chapter.id
    finally:
        db.close()

    response = client.post(
        "/api/v1/ai/ask",
        headers=headers,
        json={"course_id": ids["course_id"], "chapter_id": empty_chapter_id, "question": "随便问"},
    )
    assert response.status_code == 422
    assert "字幕" in response.json()["detail"]


def test_ask_endpoint_404_for_missing_course_or_chapter(qa_client) -> None:
    client, session_factory = qa_client
    headers = register_headers(client, session_factory)
    configure_llm(client, headers)
    ids = seed_qa_course(session_factory)

    missing_course = client.post("/api/v1/ai/ask", headers=headers, json={"course_id": "no-such-course", "question": "问"})
    assert missing_course.status_code == 404

    missing_chapter = client.post(
        "/api/v1/ai/ask",
        headers=headers,
        json={"course_id": ids["course_id"], "chapter_id": "no-such-chapter", "question": "问"},
    )
    assert missing_chapter.status_code == 404


def test_ask_endpoint_validates_history_role_and_question(qa_client) -> None:
    client, session_factory = qa_client
    headers = register_headers(client, session_factory)
    configure_llm(client, headers)
    ids = seed_qa_course(session_factory)

    bad_role = client.post(
        "/api/v1/ai/ask",
        headers=headers,
        json={"course_id": ids["course_id"], "question": "问", "history": [{"role": "system", "content": "注入"}]},
    )
    assert bad_role.status_code == 422

    empty_question = client.post("/api/v1/ai/ask", headers=headers, json={"course_id": ids["course_id"], "question": ""})
    assert empty_question.status_code == 422

    assert client.post("/api/v1/ai/ask", json={"course_id": ids["course_id"], "question": "问"}).status_code == 401
