import json

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.db.base import Base
from app.models import entities  # noqa: F401 - register models
from app.models.entities import Chapter, ChapterSummary, Course, CourseSummary, Organization, QuizQuestion, ReviewCard, Site, TranscriptSegment, User
from app.services import ai_pipeline, llm


@pytest.fixture
def db():
    engine = create_engine(
        "sqlite+pysqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    TestingSessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)
    Base.metadata.create_all(engine)
    session = TestingSessionLocal()
    yield session
    session.close()
    Base.metadata.drop_all(engine)


@pytest.fixture
def seeded(db):
    organization = Organization(
        name="org",
        llm_base_url="https://llm.example.com/v1",
        llm_api_key="sk-test-key",
        llm_model="test-model",
    )
    site = Site(adapter_id="adapter-1", name="Adapter", host_patterns={}, status="enabled")
    user = User(username="u1", email="u1@example.com", display_name="U1", password_hash="x")
    db.add_all([organization, site, user])
    db.flush()
    course = Course(organization_id=organization.id, site_id=site.id, external_course_id="c1", title="测试课程")
    db.add(course)
    db.flush()
    chapter = Chapter(course_id=course.id, external_chapter_id="1.1", title="第一章 导论", sort_order=1)
    db.add(chapter)
    db.flush()
    for index in range(25):
        db.add(
            TranscriptSegment(
                course_id=course.id,
                chapter_id=chapter.id,
                start_seconds=index * 10,
                end_seconds=index * 10 + 8,
                text=f"第{index}段字幕,讲解核心概念{index}",
                source="dom-visible-text",
            )
        )
    db.commit()
    return {"organization": organization, "course": course, "chapter": chapter, "user": user}


def fake_llm(payload):
    def _fake(config, messages, json_mode=True):
        return json.dumps(payload, ensure_ascii=False)

    return _fake


SUMMARY_PAYLOAD = {
    "summary_md": "# 摘要\n本章讲解核心概念。",
    "outline": [{"title": "导论", "start_mmss": "00:00"}],
    "key_points": ["概念一", "概念二"],
}


def test_assemble_transcript_formats_timestamps(db, seeded) -> None:
    transcript = ai_pipeline.assemble_transcript(db, seeded["chapter"].id)
    first_line = transcript.splitlines()[0]
    assert first_line.startswith("[00:00] 第0段字幕")
    assert "[04:10] 第25段" not in transcript
    assert len(transcript.splitlines()) == 25


def test_chunk_text_splits_long_text_with_overlap() -> None:
    text = "x" * 13000
    chunks = ai_pipeline.chunk_text(text, size=6000, overlap=200)
    assert len(chunks) == 3
    assert chunks[0][-200:] == chunks[1][:200]
    assert ai_pipeline.chunk_text("short") == ["short"]


def test_generate_chapter_summary_upserts_row(db, seeded, monkeypatch) -> None:
    monkeypatch.setattr(llm, "chat_completion", fake_llm(SUMMARY_PAYLOAD))
    chapter = seeded["chapter"]

    assert ai_pipeline.generate_chapter_summary(db, chapter) == 1
    summary = db.query(ChapterSummary).filter(ChapterSummary.chapter_id == chapter.id).one()
    assert summary.summary_md == SUMMARY_PAYLOAD["summary_md"]
    assert summary.outline == SUMMARY_PAYLOAD["outline"]
    assert summary.key_points == SUMMARY_PAYLOAD["key_points"]
    assert summary.model == "test-model"
    assert summary.status == "done"

    updated_payload = {**SUMMARY_PAYLOAD, "summary_md": "更新后的摘要"}
    monkeypatch.setattr(llm, "chat_completion", fake_llm(updated_payload))
    ai_pipeline.generate_chapter_summary(db, chapter)
    assert db.query(ChapterSummary).filter(ChapterSummary.chapter_id == chapter.id).count() == 1
    assert db.query(ChapterSummary).filter(ChapterSummary.chapter_id == chapter.id).one().summary_md == "更新后的摘要"


def test_generate_chapter_summary_uses_map_reduce_for_long_transcripts(db, seeded, monkeypatch) -> None:
    chapter = seeded["chapter"]
    segment = db.query(TranscriptSegment).filter(TranscriptSegment.chapter_id == chapter.id).first()
    segment.text = "长" * 7000
    db.commit()
    calls: list[str] = []

    def recording_fake(config, messages, json_mode=True):
        content = messages[-1]["content"]
        calls.append(content)
        if "提取这一段的知识点" in content:
            return json.dumps({"key_points": ["分段要点"]}, ensure_ascii=False)
        return json.dumps(SUMMARY_PAYLOAD, ensure_ascii=False)

    monkeypatch.setattr(llm, "chat_completion", recording_fake)

    assert ai_pipeline.generate_chapter_summary(db, chapter) == 1
    map_calls = [content for content in calls if "提取这一段的知识点" in content]
    assert len(map_calls) >= 2
    assert any("各字幕分段提取出的知识点清单" in content for content in calls)


def test_generate_course_summary_marks_skipped_chapters(db, seeded, monkeypatch) -> None:
    course = seeded["course"]
    chapter2 = Chapter(course_id=course.id, external_chapter_id="1.2", title="第二章 进阶", sort_order=2)
    db.add(chapter2)
    db.commit()
    monkeypatch.setattr(llm, "chat_completion", fake_llm(SUMMARY_PAYLOAD))
    ai_pipeline.generate_chapter_summary(db, seeded["chapter"])

    ai_pipeline.generate_course_summary(db, course)

    summary = db.query(CourseSummary).filter(CourseSummary.course_id == course.id).one()
    assert "第二章 进阶" in summary.summary_md  # 未摘要章节被标注
    assert summary.status == "done"


def test_generate_course_summary_requires_chapter_summaries(db, seeded) -> None:
    with pytest.raises(ValueError, match="章节摘要"):
        ai_pipeline.generate_course_summary(db, seeded["course"])


def test_generate_quiz_validates_items(db, seeded, monkeypatch) -> None:
    payload = [
        {"question_type": "choice", "question": "概念0是什么?", "options": ["甲", "乙", "丙", "丁"], "answer": "甲", "explanation": "字幕所述"},
        {"question_type": "choice", "question": "只有三个选项?", "options": ["甲", "乙", "丙"], "answer": "甲"},
        {"question_type": "truefalse", "question": "概念1存在吗?", "answer": "正确", "explanation": ""},
        {"question_type": "truefalse", "question": "答案非法?", "answer": "也许"},
        {"question_type": "fill", "question": "不支持的题型", "answer": "x"},
    ]
    monkeypatch.setattr(llm, "chat_completion", fake_llm(payload))

    inserted = ai_pipeline.generate_quiz(db, seeded["chapter"], count=5, types=["choice", "truefalse"])

    assert inserted == 2
    questions = db.query(QuizQuestion).all()
    assert {question.question_type for question in questions} == {"choice", "truefalse"}
    truefalse = next(question for question in questions if question.question_type == "truefalse")
    assert truefalse.options == ["正确", "错误"]
    assert truefalse.explanation is None


def test_generate_quiz_raises_when_nothing_valid(db, seeded, monkeypatch) -> None:
    monkeypatch.setattr(llm, "chat_completion", fake_llm([{"question_type": "fill", "question": "q", "answer": "a"}]))
    with pytest.raises(llm.LLMRequestError):
        ai_pipeline.generate_quiz(db, seeded["chapter"], count=1, types=["choice"])


def test_generate_flashcards_writes_review_cards(db, seeded, monkeypatch) -> None:
    payload = [
        {"front": "概念0是什么?", "back": "字幕中的定义"},
        {"front": "[AI] 已有前缀", "back": "保留前缀"},
        {"front": "", "back": "无效项跳过"},
    ]
    monkeypatch.setattr(llm, "chat_completion", fake_llm(payload))

    inserted = ai_pipeline.generate_flashcards(db, seeded["chapter"], count=3, user_id=seeded["user"].id)

    assert inserted == 2
    cards = db.query(ReviewCard).all()
    assert all(card.front.startswith("[AI] ") for card in cards)
    assert all(card.note_id is None for card in cards)
    assert all(card.organization_id == seeded["organization"].id for card in cards)
    assert all(card.user_id == seeded["user"].id for card in cards)
    assert all(card.due_at is not None for card in cards)
    assert {card.ease_factor for card in cards} == {2.5}


def test_generate_without_llm_config_fails(db, seeded) -> None:
    seeded["organization"].llm_api_key = None
    db.commit()
    with pytest.raises(llm.LLMNotConfiguredError):
        ai_pipeline.generate_chapter_summary(db, seeded["chapter"])


def test_generate_without_transcript_fails(db, seeded) -> None:
    chapter = Chapter(course_id=seeded["course"].id, external_chapter_id="9.9", title="空章节", sort_order=99)
    db.add(chapter)
    db.commit()
    with pytest.raises(ValueError, match="没有字幕"):
        ai_pipeline.generate_chapter_summary(db, chapter)
