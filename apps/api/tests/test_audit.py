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


    response = client.post(
        "/api/v1/auth/register",
        json={"email": f"member-{uuid4().hex[:8]}@example.com", "password": "secret123", "display_name": "Member"},
    )
    assert response.status_code == 200
    member_headers = {"Authorization": f"Bearer {response.json()['token']}"}

    assert client.get("/api/v1/audit-logs", headers=member_headers).status_code == 403


def test_audit_logs_can_be_filtered_by_time_range(client, auth_headers, session_factory) -> None:
    from datetime import UTC, datetime

    db = session_factory()
    try:
        db.add_all(
            [
                AuditLog(action="test_range_old", payload={}, created_at=datetime(2026, 1, 1, 0, 0, tzinfo=UTC)),
                AuditLog(action="test_range_new", payload={}, created_at=datetime(2026, 1, 3, 0, 0, tzinfo=UTC)),
            ]
        )
        db.commit()
    finally:
        db.close()

    after = client.get("/api/v1/audit-logs?start=2026-01-02T00:00:00Z", headers=auth_headers)
    assert after.status_code == 200
    actions = [item["action"] for item in after.json()["items"]]
    assert "test_range_new" in actions
    assert "test_range_old" not in actions

    before = client.get("/api/v1/audit-logs?end=2026-01-02T00:00:00Z", headers=auth_headers)
    actions = [item["action"] for item in before.json()["items"]]
    assert "test_range_old" in actions
    assert "test_range_new" not in actions

    invalid = client.get(
        "/api/v1/audit-logs?start=2026-01-03T00:00:00Z&end=2026-01-02T00:00:00Z",
        headers=auth_headers,
    )
    assert invalid.status_code == 400


def test_audit_log_time_is_serialized_with_timezone(client, auth_headers, session_factory) -> None:
    """SQLite 取出的 naive UTC 时间要标上时区,否则前端会按本地时间误读。"""
    from datetime import datetime

    db = session_factory()
    try:
        db.add(AuditLog(action="test_naive_time", payload={}, created_at=datetime(2026, 1, 1, 8, 0)))
        db.commit()
    finally:
        db.close()

    item = _actions(client, auth_headers, "test_naive_time")[0]
    parsed = datetime.fromisoformat(item["created_at"])
    assert parsed.tzinfo is not None


def test_bulk_delete_audit_logs_keeps_a_cleanup_record(client, auth_headers, session_factory) -> None:
    db = session_factory()
    try:
        db.add_all([AuditLog(action="test_delete_a", payload={}), AuditLog(action="test_delete_b", payload={})])
        db.commit()
        ids = [
            row.id
            for row in db.query(AuditLog).filter(AuditLog.action.in_(["test_delete_a", "test_delete_b"])).all()
        ]
    finally:
        db.close()

    response = client.post("/api/v1/audit-logs/bulk-delete", headers=auth_headers, json={"ids": ids})
    assert response.status_code == 200
    assert response.json()["affected"] == 2

    db = session_factory()
    try:
        assert db.query(AuditLog).filter(AuditLog.id.in_(ids)).count() == 0
        cleanup = db.query(AuditLog).filter(AuditLog.action == "audit_logs_deleted").one()
        assert cleanup.payload["count"] == 2
        assert cleanup.user_id
    finally:
        db.close()


def test_bulk_delete_audit_logs_requires_owner(client, auth_headers, session_factory) -> None:
    from uuid import uuid4

    db = session_factory()
    try:
        log = AuditLog(action="test_owner_only", payload={})
        db.add(log)
        db.commit()
        log_id = log.id
    finally:
        db.close()

    response = client.post(
        "/api/v1/auth/register",
        json={"email": f"member-{uuid4().hex[:8]}@example.com", "password": "secret123", "display_name": "Member"},
    )
    assert response.status_code == 200
    member_headers = {"Authorization": f"Bearer {response.json()['token']}"}

    blocked = client.post("/api/v1/audit-logs/bulk-delete", headers=member_headers, json={"ids": [log_id]})
    assert blocked.status_code == 403
