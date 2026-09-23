from collections.abc import Generator
from datetime import datetime, timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.db.base import Base
from app.db.session import get_db
from app.main import create_app
from app.models import entities  # noqa: F401 - register models
from app.models.entities import (
    AiTask,
    Chapter,
    Course,
    Note,
    Organization,
    QuizAttempt,
    QuizQuestion,
    ReviewCard,
    ReviewLog,
    Site,
    TranscriptSegment,
    User,
    VideoSession,
)
from app.services import ai_tasks, digest, emailer, llm
from app.services.digest import build_digest, digest_is_due
from app.services.digest_scheduler import run_digest_tick
from app.services.plugins import ensure_default_organization
from app.services.review import utc_now


class FakeSMTP:
    instances: list["FakeSMTP"] = []
    fail_on_send = False

    def __init__(self, host, port, timeout=None):
        self.host = host
        self.port = port
        self.logged_in = None
        self.sent: list[tuple] = []
        FakeSMTP.instances.append(self)

    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False

    def login(self, username, password):
        self.logged_in = (username, password)

    def starttls(self):
        self.tls = True

    def sendmail(self, sender, recipients, message):
        if FakeSMTP.fail_on_send:
            raise RuntimeError("SMTP 连接被拒")
        self.sent.append((sender, recipients, message))


@pytest.fixture
def email_client(monkeypatch) -> Generator[tuple[TestClient, sessionmaker], None, None]:
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
    FakeSMTP.instances = []
    FakeSMTP.fail_on_send = False
    monkeypatch.setattr(emailer.smtplib, "SMTP_SSL", FakeSMTP)
    monkeypatch.setattr(emailer.smtplib, "SMTP", FakeSMTP)
    with TestClient(app) as test_client:
        yield test_client, TestingSessionLocal
    app.dependency_overrides.clear()
    Base.metadata.drop_all(engine)


def register_headers(client: TestClient) -> dict[str, str]:
    response = client.post(
        "/api/v1/auth/register",
        json={"email": "email-user@example.com", "password": "secret123", "display_name": "Mail User"},
    )
    assert response.status_code == 200
    return {"Authorization": f"Bearer {response.json()['token']}"}


def configure_smtp(client: TestClient, headers: dict[str, str], **overrides) -> None:
    payload = {
        "smtp_host": "smtp.qq.com",
        "smtp_port": 465,
        "smtp_username": "learner@qq.com",
        "smtp_password": "authcode1234",
        "email_to": "self@example.com",
    }
    payload.update(overrides)
    response = client.put("/api/v1/email/settings", headers=headers, json=payload)
    assert response.status_code == 200


def seed_note_with_context(session_factory) -> dict:
    db = session_factory()
    try:
        organization = ensure_default_organization(db)
        site = Site(adapter_id="adapter-mail", name="Adapter", host_patterns={}, status="enabled")
        db.add(site)
        db.flush()
        course = Course(organization_id=organization.id, site_id=site.id, external_course_id="c1", title="测试课程")
        db.add(course)
        db.flush()
        chapter = Chapter(course_id=course.id, external_chapter_id="1.1", title="第一章 导论", sort_order=1)
        db.add(chapter)
        db.flush()
        user = db.query(User).first()
        for start, text in ((100, "字幕甲"), (108, "字幕乙"), (200, "远处字幕")):
            db.add(
                TranscriptSegment(
                    course_id=course.id,
                    chapter_id=chapter.id,
                    start_seconds=start,
                    end_seconds=start + 5,
                    text=text,
                    source="dom-visible-text",
                )
            )
        note = Note(
            course_id=course.id,
            chapter_id=chapter.id,
            user_id=user.id,
            video_time_seconds=110,
            content="原始笔记",
            corrected_content="勘误后的笔记",
        )
        db.add(note)
        db.commit()
        return {"course_id": course.id, "chapter_id": chapter.id, "note_id": note.id, "user_id": user.id}
    finally:
        db.close()


def test_settings_defaults(email_client) -> None:
    client, _ = email_client
    headers = register_headers(client)

    response = client.get("/api/v1/email/settings", headers=headers)

    assert response.status_code == 200
    body = response.json()
    assert body["configured"] is False
    assert body["smtp_port"] == 465
    assert body["password_masked"] is None
    assert body["digest_auto"] is False
    assert body["digest_frequency"] == "daily"
    assert body["digest_hour"] == 8
    assert body["last_digest_at"] is None


def test_settings_update_mask_keep_and_clear_password(email_client) -> None:
    client, _ = email_client
    headers = register_headers(client)
    configure_smtp(client, headers)

    body = client.get("/api/v1/email/settings", headers=headers).json()
    assert body["configured"] is True
    assert body["password_masked"] == "****1234"
    assert body["smtp_host"] == "smtp.qq.com"
    assert "authcode1234" not in str(body)

    # 不传 smtp_password = 不修改
    response = client.put("/api/v1/email/settings", headers=headers, json={"digest_auto": True, "digest_frequency": "weekly", "digest_hour": 7})
    assert response.status_code == 200
    assert response.json()["password_masked"] == "****1234"
    assert response.json()["digest_auto"] is True
    assert response.json()["digest_frequency"] == "weekly"
    assert response.json()["digest_hour"] == 7

    # 传空串 = 清除
    cleared = client.put("/api/v1/email/settings", headers=headers, json={"smtp_password": ""})
    assert cleared.status_code == 200
    assert cleared.json()["password_masked"] is None
    assert cleared.json()["configured"] is False


def test_settings_validation(email_client) -> None:
    client, _ = email_client
    headers = register_headers(client)

    bad_frequency = client.put("/api/v1/email/settings", headers=headers, json={"digest_frequency": "monthly"})
    assert bad_frequency.status_code == 422
    bad_hour = client.put("/api/v1/email/settings", headers=headers, json={"digest_hour": 24})
    assert bad_hour.status_code == 422


def test_settings_test_endpoint(email_client) -> None:
    client, _ = email_client
    headers = register_headers(client)

    not_configured = client.post("/api/v1/email/settings/test", headers=headers)
    assert not_configured.status_code == 400

    configure_smtp(client, headers)
    ok = client.post("/api/v1/email/settings/test", headers=headers)
    assert ok.status_code == 200
    assert ok.json() == {"ok": True, "detail": None}
    server = FakeSMTP.instances[-1]
    assert server.host == "smtp.qq.com"
    assert server.port == 465
    assert server.logged_in == ("learner@qq.com", "authcode1234")
    assert server.sent and server.sent[0][1] == ["self@example.com"]

    FakeSMTP.fail_on_send = True
    failed = client.post("/api/v1/email/settings/test", headers=headers)
    assert failed.status_code == 200
    assert failed.json()["ok"] is False
    assert failed.json()["detail"]


def test_send_note_email_includes_transcript_context(email_client, monkeypatch) -> None:
    client, session_factory = email_client
    headers = register_headers(client)
    ids = seed_note_with_context(session_factory)
    configure_smtp(client, headers)

    captured: dict = {}
    real_send = emailer.send_email

    def spy_send(config, to, subject, html_body, text_body=None):
        captured.update({"to": to, "subject": subject, "html": html_body, "text": text_body})
        return real_send(config, to, subject, html_body, text_body)

    monkeypatch.setattr("app.routes.email.emailer.send_email", spy_send)

    response = client.post(f"/api/v1/email/notes/{ids['note_id']}/send", headers=headers)

    assert response.status_code == 200
    assert response.json() == {"ok": True, "detail": None}
    assert captured["to"] == "self@example.com"
    assert "测试课程" in captured["subject"]
    assert "勘误后的笔记" in captured["text"]
    assert "第一章 导论" in captured["text"]
    assert "01:50" in captured["text"]
    assert "字幕甲" in captured["text"]
    assert "字幕乙" in captured["text"]
    assert "远处字幕" not in captured["text"]
    assert FakeSMTP.instances[-1].sent

    missing = client.post("/api/v1/email/notes/no-such-note/send", headers=headers)
    assert missing.status_code == 404


def seed_activity(session_factory, organization_id: str, user_id: str) -> None:
    db = session_factory()
    try:
        course = db.query(Course).first()
        chapter = db.query(Chapter).filter(Chapter.course_id == course.id).first()
        db.add(Note(course_id=course.id, chapter_id=chapter.id, user_id=user_id, content=" digest 笔记 "))
        db.add(
            VideoSession(
                course_id=course.id,
                chapter_id=chapter.id,
                user_id=user_id,
                duration_watched_seconds=1800,
                source_url="https://example.com/v",
            )
        )
        card = ReviewCard(
            organization_id=organization_id,
            course_id=course.id,
            chapter_id=chapter.id,
            user_id=user_id,
            front="问",
            back="答",
            due_at=utc_now() - timedelta(hours=1),
        )
        db.add(card)
        db.flush()
        db.add(ReviewLog(card_id=card.id, result="good"))
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
                organization_id=organization_id,
                user_id=user_id,
                question_id=question.id,
                course_id=course.id,
                chapter_id=chapter.id,
                chosen="甲",
                correct=True,
            )
        )
        db.commit()
    finally:
        db.close()


def test_build_digest_without_llm_uses_template(email_client) -> None:
    client, session_factory = email_client
    register_headers(client)
    ids = seed_note_with_context(session_factory)
    seed_activity(session_factory, ensure_org_id(session_factory), ids["user_id"])

    db = session_factory()
    try:
        organization = db.query(Organization).first()
        user = db.get(User, ids["user_id"])
        since = datetime.now() - timedelta(hours=24)
        subject, html_body, text_body = build_digest(db, organization, user, since)
    finally:
        db.close()

    assert "学习总结" in subject
    assert "新增笔记 2 条" in text_body
    assert "学习时长 30 分钟" in text_body
    assert "复习 1 次" in text_body
    assert "测验答题 1 题" in text_body
    assert "到期卡片 1 张" in text_body
    assert "Mail User" in text_body
    assert "<html>" in html_body


def ensure_org_id(session_factory) -> str:
    db = session_factory()
    try:
        return ensure_default_organization(db).id
    finally:
        db.close()


def test_build_digest_with_llm(email_client, monkeypatch) -> None:
    client, session_factory = email_client
    register_headers(client)
    ids = seed_note_with_context(session_factory)
    db = session_factory()
    try:
        organization = db.query(Organization).first()
        organization.llm_base_url = "https://llm.example.com/v1"
        organization.llm_api_key = "sk-test"
        organization.llm_model = "test-model"
        db.commit()
    finally:
        db.close()
    monkeypatch.setattr(llm, "chat_completion", lambda config, messages, json_mode=True: "AI 学习重点总结段落")

    db = session_factory()
    try:
        organization = db.query(Organization).first()
        user = db.get(User, ids["user_id"])
        _, html_body, text_body = build_digest(db, organization, user, datetime.now() - timedelta(hours=24))
    finally:
        db.close()

    assert "AI 学习重点总结段落" in text_body
    assert "AI 学习重点总结段落" in html_body


def test_digest_send_endpoint_runs_task(email_client) -> None:
    client, session_factory = email_client
    headers = register_headers(client)

    not_configured = client.post("/api/v1/email/digest/send", headers=headers)
    assert not_configured.status_code == 400

    configure_smtp(client, headers)
    response = client.post("/api/v1/email/digest/send", headers=headers)

    assert response.status_code == 200
    task_id = response.json()["task_id"]
    db = session_factory()
    try:
        task = db.get(AiTask, task_id)
        assert task.task_type == "email_digest"
        assert task.course_id is None
        assert task.status == "done", task.error
        organization = db.query(Organization).first()
        assert organization.last_digest_at is not None
    finally:
        db.close()
    assert FakeSMTP.instances[-1].sent


def test_run_digest_tick_sends_due_organization(email_client) -> None:
    client, session_factory = email_client
    headers = register_headers(client)
    configure_smtp(client, headers, digest_auto=True, digest_frequency="daily", digest_hour=8)

    now = datetime(2026, 9, 22, 9, 0)  # 周二 09:00,已过 digest_hour 且从未发送
    run_digest_tick(session_factory, now)

    db = session_factory()
    try:
        organization = db.query(Organization).first()
        assert organization.last_digest_at is not None
    finally:
        db.close()
    assert FakeSMTP.instances[-1].sent

    # 同一天再次 tick 不应重复发送
    sent_count = len(FakeSMTP.instances[-1].sent)
    run_digest_tick(session_factory, datetime(2026, 9, 22, 10, 0))
    assert len(FakeSMTP.instances[-1].sent) == sent_count


def make_org(**overrides) -> Organization:
    org = Organization(name="测试组织", digest_auto=True, digest_frequency="daily", digest_hour=8)
    for key, value in overrides.items():
        setattr(org, key, value)
    return org


MONDAY_9AM = datetime(2026, 9, 21, 9, 0)
assert MONDAY_9AM.weekday() == 0


def test_digest_is_due_daily_branches() -> None:
    assert digest_is_due(make_org(digest_auto=False), MONDAY_9AM) is False
    assert digest_is_due(make_org(), datetime(2026, 9, 21, 7, 0)) is False
    assert digest_is_due(make_org(last_digest_at=None), MONDAY_9AM) is True
    assert digest_is_due(make_org(last_digest_at=datetime(2026, 9, 21, 8, 30)), MONDAY_9AM) is False
    assert digest_is_due(make_org(last_digest_at=datetime(2026, 9, 20, 20, 0)), MONDAY_9AM) is True


def test_digest_is_due_weekly_branches() -> None:
    weekly = {"digest_frequency": "weekly"}
    assert digest_is_due(make_org(**weekly), datetime(2026, 9, 22, 9, 0)) is False  # 周二不发
    assert digest_is_due(make_org(**weekly), datetime(2026, 9, 21, 7, 0)) is False  # 周一但未到点
    assert digest_is_due(make_org(**weekly, last_digest_at=None), MONDAY_9AM) is True
    assert digest_is_due(make_org(**weekly, last_digest_at=MONDAY_9AM - timedelta(days=8)), MONDAY_9AM) is True
    assert digest_is_due(make_org(**weekly, last_digest_at=MONDAY_9AM - timedelta(days=2)), MONDAY_9AM) is False


def test_email_endpoints_require_auth(email_client) -> None:
    client, _ = email_client

    assert client.get("/api/v1/email/settings").status_code == 401
    assert client.put("/api/v1/email/settings", json={}).status_code == 401
    assert client.post("/api/v1/email/digest/send").status_code == 401
