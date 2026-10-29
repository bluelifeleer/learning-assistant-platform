"""课程合并：章节去重、子数据改挂、唯一约束冲突、引用解除、权限。"""

from datetime import UTC, datetime
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
    email = f"merge-{role}-{uuid4().hex[:8]}@example.com"
    response = client.post(
        "/api/v1/auth/register",
        json={"email": email, "password": "secret123", "display_name": f"Merge {role}"},
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


def _site(db) -> Site:
    site = db.query(Site).filter(Site.adapter_id == "merge-site").first()
    if site is None:
        site = Site(adapter_id="merge-site", name="合并站点")
        db.add(site)
        db.flush()
    return site


def _course(db, organization_id: str, title: str) -> Course:
    course = Course(
        organization_id=organization_id,
        site_id=_site(db).id,
        external_course_id=f"merge-{uuid4().hex[:6]}",
        title=title,
    )
    db.add(course)
    db.flush()
    return course


def _chapter(db, course: Course, external_id: str, title: str) -> Chapter:
    chapter = Chapter(course_id=course.id, external_chapter_id=external_id, title=title, sort_order=1)
    db.add(chapter)
    db.flush()
    return chapter


def _seed_pair(session_factory, account: dict) -> dict:
    """目标课程 T 与来源课程 S：同一章的重复数据 + 来源独有的章与数据。"""
    db = session_factory()
    try:
        org = account["organization_id"]
        user_id = account["user_id"]
        target = _course(db, org, "目标课程")
        source = _course(db, org, "来源课程")

        target_shared = _chapter(db, target, "ch-shared", "共享章节")
        source_shared = _chapter(db, source, "ch-shared", "共享章节")
        source_only = _chapter(db, source, "ch-only", "来源独有章节")

        # 共享章节：两边都有字幕/笔记/截图/会话/摘要/备忘
        db.add(TranscriptSegment(course_id=target.id, chapter_id=target_shared.id, start_seconds=0, text="目标字幕", source="test"))
        db.add(TranscriptSegment(course_id=source.id, chapter_id=source_shared.id, start_seconds=0, text="来源字幕", source="test"))
        db.add(Note(course_id=target.id, chapter_id=target_shared.id, user_id=user_id, content="目标笔记"))
        db.add(Note(course_id=source.id, chapter_id=source_shared.id, user_id=user_id, content="来源笔记"))
        db.add(
            Screenshot(
                organization_id=org,
                course_id=source.id,
                chapter_id=source_shared.id,
                user_id=user_id,
                file_path="C:/tmp/merge-shot.png",
            )
        )
        db.add(
            VideoSession(
                course_id=source.id,
                chapter_id=source_shared.id,
                user_id=user_id,
                source_url="https://example.test/v/1",
            )
        )
        db.add(ChapterSummary(chapter_id=target_shared.id, course_id=target.id, summary_md="目标摘要", model="test"))
        db.add(ChapterSummary(chapter_id=source_shared.id, course_id=source.id, summary_md="来源摘要", model="test"))
        db.add(ChapterMemo(chapter_id=target_shared.id, course_id=target.id, content_md="目标备忘"))
        db.add(ChapterMemo(chapter_id=source_shared.id, course_id=source.id, content_md="来源备忘"))

        # 来源独有章节的数据
        db.add(TranscriptSegment(course_id=source.id, chapter_id=source_only.id, start_seconds=5, text="独有字幕", source="test"))
        db.add(Note(course_id=source.id, chapter_id=source_only.id, user_id=user_id, content="独有笔记"))

        # 课程级摘要：两边都有 → 保留目标
        db.add(CourseSummary(course_id=target.id, summary_md="目标课程总结", model="test"))
        db.add(CourseSummary(course_id=source.id, summary_md="来源课程总结", model="test"))

        # 重复卡片（同正面）与独有卡片
        db.add(ReviewCard(organization_id=org, course_id=target.id, user_id=user_id, front="同正面", back="目标背面", due_at=datetime.now(UTC)))
        db.add(ReviewCard(organization_id=org, course_id=source.id, user_id=user_id, front="同正面", back="来源背面", due_at=datetime.now(UTC)))
        db.add(ReviewCard(organization_id=org, course_id=source.id, user_id=user_id, front="来源独有卡", back="背面", due_at=datetime.now(UTC)))

        # 重复题目（同章同题干）与独有题目；重复题带一条作答记录
        target_question = QuizQuestion(
            course_id=target.id,
            chapter_id=target_shared.id,
            question_type="choice",
            question="同一道题?",
            options=["A", "B"],
            answer="A",
            model="test",
        )
        source_question = QuizQuestion(
            course_id=source.id,
            chapter_id=source_shared.id,
            question_type="choice",
            question="同一道题?",
            options=["A", "B"],
            answer="A",
            model="test",
        )
        db.add_all([target_question, source_question])
        db.flush()
        db.add(
            QuizAttempt(
                organization_id=org,
                user_id=user_id,
                question_id=source_question.id,
                course_id=source.id,
                chapter_id=source_shared.id,
                chosen="A",
                correct=True,
            )
        )
        db.add(
            QuizQuestion(
                course_id=source.id,
                chapter_id=source_only.id,
                question_type="choice",
                question="来源独有题?",
                options=["A", "B"],
                answer="B",
                model="test",
            )
        )

        # 指向来源课程的导出记录
        export = Export(
            organization_id=org,
            user_id=user_id,
            course_id=source.id,
            format="markdown",
            status="completed",
            progress=100,
        )
        db.add(export)
        db.commit()

        return {
            "target_id": target.id,
            "source_id": source.id,
            "target_chapter_id": target_shared.id,
            "source_chapter_id": source_shared.id,
            "source_only_chapter_id": source_only.id,
            "export_id": export.id,
        }
    finally:
        db.close()


def test_merge_moves_children_and_dedupes(client, session_factory) -> None:
    account = _register(client, session_factory)
    ids = _seed_pair(session_factory, account)

    response = client.post(
        f"/api/v1/courses/{ids['source_id']}/merge",
        headers=account["headers"],
        json={"target_course_id": ids["target_id"]},
    )

    assert response.status_code == 200, response.text
    stats = response.json()
    assert stats["merged_into"] == ids["target_id"]
    assert stats["deleted_course"] == ids["source_id"]
    assert stats["chapters_merged"] == 1
    assert stats["chapters_moved"] == 1
    assert stats["summaries_dropped"] == 2  # 章节摘要 + 课程摘要
    assert stats["memos_merged"] == 1
    assert stats["cards_dropped"] == 1
    assert stats["questions_dropped"] == 1

    db = session_factory()
    try:
        target_id = ids["target_id"]
        # 来源课程没了
        assert db.get(Course, ids["source_id"]) is None
        # 章节：共享章节只保留目标那一章，独有章节整章搬过来
        chapters = db.query(Chapter).filter(Chapter.course_id == target_id).all()
        assert {chapter.external_chapter_id for chapter in chapters} == {"ch-shared", "ch-only"}
        assert {chapter.id for chapter in chapters} >= {ids["target_chapter_id"], ids["source_only_chapter_id"]}

        # 字幕/笔记都落到目标课程；共享章节的行挂在目标章节上
        transcripts = db.query(TranscriptSegment).filter(TranscriptSegment.course_id == target_id).all()
        assert {row.text for row in transcripts} == {"目标字幕", "来源字幕", "独有字幕"}
        shared_transcript = next(row for row in transcripts if row.text == "来源字幕")
        assert shared_transcript.chapter_id == ids["target_chapter_id"]

        notes = db.query(Note).filter(Note.course_id == target_id).all()
        assert {row.content for row in notes} == {"目标笔记", "来源笔记", "独有笔记"}

        assert db.query(Screenshot).filter(Screenshot.course_id == target_id).count() == 1
        assert db.query(VideoSession).filter(VideoSession.course_id == target_id).count() == 1

        # 摘要：目标的保留，来源的被丢弃
        summary = db.query(ChapterSummary).filter(ChapterSummary.chapter_id == ids["target_chapter_id"]).one()
        assert summary.summary_md == "目标摘要"
        assert db.query(ChapterSummary).count() == 1
        course_summary = db.query(CourseSummary).filter(CourseSummary.course_id == target_id).one()
        assert course_summary.summary_md == "目标课程总结"

        # 备忘：两段都保留，按顺序拼接
        memo = db.query(ChapterMemo).filter(ChapterMemo.chapter_id == ids["target_chapter_id"]).one()
        assert "目标备忘" in memo.content_md and "来源备忘" in memo.content_md

        # 卡片：同正面只留一张，独有卡片搬过来
        fronts = [card.front for card in db.query(ReviewCard).filter(ReviewCard.course_id == target_id).all()]
        assert sorted(fronts) == ["同正面", "来源独有卡"]

        # 题目：同章同题干只留一道，独有题搬过来；重复题的作答记录被清掉
        questions = [row.question for row in db.query(QuizQuestion).filter(QuizQuestion.course_id == target_id).all()]
        assert sorted(questions) == ["同一道题?", "来源独有题?"]
        assert db.query(QuizAttempt).count() == 0

        # 导出记录保留，只解除课程引用
        export = db.get(Export, ids["export_id"])
        assert export is not None and export.course_id is None
    finally:
        db.close()


def test_merge_rejects_self(client, session_factory) -> None:
    account = _register(client, session_factory)
    ids = _seed_pair(session_factory, account)

    response = client.post(
        f"/api/v1/courses/{ids['target_id']}/merge",
        headers=account["headers"],
        json={"target_course_id": ids["target_id"]},
    )

    assert response.status_code == 400
    assert "自己" in response.json()["detail"]


def test_merge_requires_owner(client, session_factory) -> None:
    owner = _register(client, session_factory, role="owner")
    member = _register(client, session_factory, role="member")
    ids = _seed_pair(session_factory, owner)

    response = client.post(
        f"/api/v1/courses/{ids['source_id']}/merge",
        headers=member["headers"],
        json={"target_course_id": ids["target_id"]},
    )

    assert response.status_code == 403


def test_merge_unknown_target_returns_404(client, session_factory) -> None:
    account = _register(client, session_factory)
    ids = _seed_pair(session_factory, account)

    response = client.post(
        f"/api/v1/courses/{ids['source_id']}/merge",
        headers=account["headers"],
        json={"target_course_id": "does-not-exist"},
    )

    assert response.status_code == 404
    # 来源课程没被动过
    db = session_factory()
    try:
        assert db.get(Course, ids["source_id"]) is not None
    finally:
        db.close()


def test_merge_other_org_course_returns_404(client, session_factory) -> None:
    account = _register(client, session_factory)
    ids = _seed_pair(session_factory, account)

    db = session_factory()
    try:
        from app.models.entities import Organization

        other_org = Organization(name="别的组织")
        db.add(other_org)
        db.flush()
        foreign = _course(db, other_org.id, "别人的课程")
        db.commit()
        foreign_id = foreign.id
    finally:
        db.close()

    response = client.post(
        f"/api/v1/courses/{ids['source_id']}/merge",
        headers=account["headers"],
        json={"target_course_id": foreign_id},
    )

    assert response.status_code == 404
