"""审计日志:关键动作必须留痕,否则「密码为什么变了」这类问题无从追溯。"""

from fastapi.testclient import TestClient

from app.models.entities import AuditLog, User


def _actions(client: TestClient, headers: dict[str, str], action: str | None = None) -> list[dict]:
    query = f"?action={action}" if action else ""
    response = client.get(f"/api/v1/audit-logs{query}", headers=headers)
    assert response.status_code == 200
    return response.json()["items"]


def test_login_success_is_audited(client, auth_headers, session_factory) -> None:
    db = session_factory()
    try:
        email = db.query(User).order_by(User.created_at).first().email
    finally:
        db.close()

    response = client.post("/api/v1/auth/login", json={"account": email, "password": "secret123"})
    assert response.status_code == 200

    items = _actions(client, auth_headers, "login_success")
    assert items
    assert items[0]["user_email"] == email
    assert items[0]["payload"]["ip"]


def test_login_failure_for_unknown_account_is_audited(client, auth_headers) -> None:
    # 典型场景:把显示名当成账号输入
    response = client.post("/api/v1/auth/login", json={"account": "李鹏", "password": "whatever"})
    assert response.status_code == 401

    items = _actions(client, auth_headers, "login_failed")
    assert items
    latest = items[0]
    assert latest["payload"]["reason"] == "no_such_account"
    assert latest["payload"]["account"] == "李鹏"
    # 账号都不存在,所以没有关联用户
    assert latest["user_id"] is None


def test_login_failure_for_wrong_password_links_the_user(client, auth_headers, session_factory) -> None:
    db = session_factory()
    try:
        user = db.query(User).order_by(User.created_at).first()
        email, user_id = user.email, user.id
    finally:
        db.close()

    assert client.post("/api/v1/auth/login", json={"account": email, "password": "wrong-one"}).status_code == 401

    latest = _actions(client, auth_headers, "login_failed")[0]
    assert latest["payload"]["reason"] == "bad_password"
    assert latest["user_id"] == user_id
    assert latest["user_email"] == email


def test_password_change_is_audited(client, auth_headers, session_factory) -> None:
    response = client.post(
        "/api/v1/auth/change-password",
        headers=auth_headers,
        json={"current_password": "secret123", "new_password": "secret456"},
    )
    assert response.status_code == 200

    latest = _actions(client, auth_headers, "password_changed")[0]
    assert latest["payload"]["via"] == "change-password"
    assert latest["user_email"]

    db = session_factory()
    try:
        assert db.query(AuditLog).filter(AuditLog.action == "password_changed").count() == 1
    finally:
        db.close()


def test_management_actions_are_audited(client, auth_headers) -> None:
    token = client.post("/api/v1/plugin-tokens", json={"name": "audit"}, headers=auth_headers).json()["token"]
    client.post(
        "/api/v1/capture/course-snapshot",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "adapter_id": "wencai-school",
            "site_url": "https://learning.example.com/",
            "external_course_id": "course-audit",
            "course_title": "审计课程",
            "chapters": [{"external_chapter_id": "ch1", "title": "第1章", "sort_order": 1, "children": []}],
        },
    )
    course_id = client.get("/api/v1/courses", headers=auth_headers).json()["items"][0]["id"]

    assert client.patch(f"/api/v1/courses/{course_id}", headers=auth_headers, json={"archived": True}).status_code == 200
    latest = _actions(client, auth_headers, "course_updated")[0]
    assert latest["resource_id"] == course_id
    assert latest["payload"]["archived"] is True

    note_id = client.post("/api/v1/notes", headers=auth_headers, json={"course_id": course_id, "content": "待删"}).json()["id"]
    assert client.delete(f"/api/v1/notes/{note_id}", headers=auth_headers).status_code == 200
    assert _actions(client, auth_headers, "note_deleted")[0]["resource_id"] == note_id


def test_audit_logs_require_owner(client, session_factory) -> None:
    """普通成员不能看审计日志(里面有账号、IP 等信息)。"""
    from uuid import uuid4

    from app.models.entities import Membership

    response = client.post(
        "/api/v1/auth/register",
        json={"email": f"member-{uuid4().hex[:8]}@example.com", "password": "secret123", "display_name": "Member"},
    )
    assert response.status_code == 200
    member_headers = {"Authorization": f"Bearer {response.json()['token']}"}

    assert client.get("/api/v1/audit-logs", headers=member_headers).status_code == 403
