"""测验题目管理：改题、删题、批量删、组织隔离。"""

from uuid import uuid4

from app.models.entities import Chapter, Course, Membership, Organization, QuizQuestion, Site, User


def _bootstrap(client, session_factory, *, email_prefix: str = "quiz") -> dict:
    """注册一个 owner 用户，并在其组织下造好 站点/课程/章节/两道题。"""
    email = f"{email_prefix}-{uuid4().hex[:8]}@example.com"
    response = client.post(
        "/api/v1/auth/register",
        json={"email": email, "password": "secret123", "display_name": "Quiz Owner"},
    )
    assert response.status_code == 200, response.text
    headers = {"Authorization": f"Bearer {response.json()['token']}"}

    db = session_factory()
    try:
        user = db.query(User).filter(User.email == email).first()
        membership = db.query(Membership).filter(Membership.user_id == user.id).first()
        membership.role = "owner"
        site = Site(adapter_id=f"quiz-site-{uuid4().hex[:6]}", name="测验站点")
        db.add(site)
        db.flush()
        course = Course(
            organization_id=membership.organization_id,
            site_id=site.id,
            external_course_id=f"quiz-course-{uuid4().hex[:6]}",
            title="测验课程",
        )
        db.add(course)
        db.flush()
        chapter = Chapter(
            course_id=course.id,
            title="第一章",
            external_chapter_id=f"ch-{uuid4().hex[:6]}",
            sort_order=1,
        )
        db.add(chapter)
        db.flush()
        questions = [
            QuizQuestion(
                course_id=course.id,
                chapter_id=chapter.id,
                question_type="choice",
                question="1+1=?",
                options=["1", "2", "3"],
                answer="2",
                explanation="基础算术",
                model="test",
            ),
            QuizQuestion(
                course_id=course.id,
                chapter_id=chapter.id,
                question_type="truefalse",
                question="地球是圆的",
                options=["正确", "错误"],
                answer="正确",
                model="test",
            ),
        ]
        db.add_all(questions)
        db.commit()
        return {
            "headers": headers,
            "course_id": course.id,
            "chapter_id": chapter.id,
            "question_ids": [question.id for question in questions],
        }
    finally:
        db.close()


def test_update_choice_question(client, session_factory) -> None:
    ctx = _bootstrap(client, session_factory)
    question_id = ctx["question_ids"][0]

    response = client.patch(
        f"/api/v1/ai/quiz/{question_id}",
        headers=ctx["headers"],
        json={"question": "2+2=?", "answer": "3", "explanation": "改过的解析"},
    )

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["question"] == "2+2=?"
    assert body["answer"] == "3"
    assert body["explanation"] == "改过的解析"
    assert body["options"] == ["1", "2", "3"]


def test_update_rejects_answer_outside_options(client, session_factory) -> None:
    ctx = _bootstrap(client, session_factory)

    response = client.patch(
        f"/api/v1/ai/quiz/{ctx['question_ids'][0]}",
        headers=ctx["headers"],
        json={"answer": "9"},
    )

    assert response.status_code == 422
    assert "选项" in response.json()["detail"]


def test_update_truefalse_normalizes_options(client, session_factory) -> None:
    ctx = _bootstrap(client, session_factory)
    question_id = ctx["question_ids"][1]

    response = client.patch(
        f"/api/v1/ai/quiz/{question_id}",
        headers=ctx["headers"],
        json={"answer": "错误", "options": ["随便写的"]},
    )

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["options"] == ["正确", "错误"]
    assert body["answer"] == "错误"


def test_update_rejects_bad_truefalse_answer(client, session_factory) -> None:
    ctx = _bootstrap(client, session_factory)

    response = client.patch(
        f"/api/v1/ai/quiz/{ctx['question_ids'][1]}",
        headers=ctx["headers"],
        json={"answer": "对的"},
    )

    assert response.status_code == 422
    assert "正确" in response.json()["detail"]


def test_delete_question_removes_it_from_list(client, session_factory) -> None:
    ctx = _bootstrap(client, session_factory)
    question_id = ctx["question_ids"][0]

    deleted = client.delete(f"/api/v1/ai/quiz/{question_id}", headers=ctx["headers"])

    assert deleted.status_code == 200
    assert deleted.json()["deleted"] == 1
    listing = client.get(
        f"/api/v1/ai/quiz?chapter_id={ctx['chapter_id']}", headers=ctx["headers"]
    ).json()["items"]
    assert [item["id"] for item in listing] == [ctx["question_ids"][1]]

    # 再删一次是 404
    assert client.delete(f"/api/v1/ai/quiz/{question_id}", headers=ctx["headers"]).status_code == 404


def test_bulk_delete_counts_only_existing_questions(client, session_factory) -> None:
    ctx = _bootstrap(client, session_factory)

    response = client.post(
        "/api/v1/ai/quiz/bulk-delete",
        headers=ctx["headers"],
        json={"ids": ctx["question_ids"] + ["missing-id"]},
    )

    assert response.status_code == 200, response.text
    assert response.json()["deleted"] == 2
    listing = client.get(
        f"/api/v1/ai/quiz?chapter_id={ctx['chapter_id']}", headers=ctx["headers"]
    ).json()["items"]
    assert listing == []


def test_other_org_questions_are_invisible_and_immutable(client, session_factory) -> None:
    """注册的新用户都会落进默认组织，所以这里直接在库里造第二个组织来验证隔离。"""
    owner_a = _bootstrap(client, session_factory, email_prefix="quiz-a")

    db = session_factory()
    try:
        other_org = Organization(name="别的组织")
        db.add(other_org)
        db.flush()
        other_user = User(
            email=f"other-{uuid4().hex[:8]}@example.com",
            display_name="Other",
            password_hash="x",
        )
        db.add(other_user)
        db.flush()
        db.add(Membership(organization_id=other_org.id, user_id=other_user.id, role="owner"))
        site = Site(adapter_id=f"other-site-{uuid4().hex[:6]}", name="别的站点")
        db.add(site)
        db.flush()
        course = Course(
            organization_id=other_org.id,
            site_id=site.id,
            external_course_id=f"other-course-{uuid4().hex[:6]}",
            title="别人的课程",
        )
        db.add(course)
        db.flush()
        chapter = Chapter(
            course_id=course.id,
            title="别人的章节",
            external_chapter_id=f"other-ch-{uuid4().hex[:6]}",
        )
        db.add(chapter)
        db.flush()
        foreign = QuizQuestion(
            course_id=course.id,
            chapter_id=chapter.id,
            question_type="choice",
            question="别人的题",
            options=["A", "B"],
            answer="A",
            model="test",
        )
        db.add(foreign)
        db.commit()
        foreign_id = foreign.id
        foreign_course_id = course.id
        foreign_chapter_id = chapter.id
    finally:
        db.close()

    headers = owner_a["headers"]
    # 列表：拿别的组织的 course_id / chapter_id 查 → 404
    assert client.get(f"/api/v1/ai/quiz?course_id={foreign_course_id}", headers=headers).status_code == 404
    assert client.get(f"/api/v1/ai/quiz?chapter_id={foreign_chapter_id}", headers=headers).status_code == 404
    # 改 / 删：404
    assert (
        client.patch(f"/api/v1/ai/quiz/{foreign_id}", headers=headers, json={"question": "偷改"}).status_code
        == 404
    )
    assert client.delete(f"/api/v1/ai/quiz/{foreign_id}", headers=headers).status_code == 404
    # 批量删：静默跳过，不会删掉别人的
    assert (
        client.post("/api/v1/ai/quiz/bulk-delete", headers=headers, json={"ids": [foreign_id]}).json()["deleted"]
        == 0
    )
    # 别人的题还在
    db = session_factory()
    try:
        assert db.get(QuizQuestion, foreign_id) is not None
    finally:
        db.close()
    # 自己组织内的题不受影响
    listing = client.get(
        f"/api/v1/ai/quiz?chapter_id={owner_a['chapter_id']}", headers=headers
    ).json()["items"]
    assert [item["id"] for item in listing] == owner_a["question_ids"]
