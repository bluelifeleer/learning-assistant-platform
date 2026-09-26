def create_plugin_token(client, headers) -> str:
    response = client.post("/api/v1/plugin-tokens", json={"name": "Edge local"}, headers=headers)
    assert response.status_code == 200
    return response.json()["token"]


def capture_sample_course(client, token: str) -> None:
    response = client.post(
        "/api/v1/capture/course-snapshot",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "adapter_id": "wencai-school",
            "site_url": "https://learning.wencaischool.net/openlearning/console/",
            "external_course_id": "course-1",
            "course_title": "供应链管理",
            "term": "第3学期",
            "chapters": [
                {
                    "external_chapter_id": "1",
                    "title": "第1章 课程导论",
                    "sort_order": 1,
                    "children": [
                        {
                            "external_chapter_id": "1.1",
                            "title": "1.1 课程主要内容",
                            "sort_order": 1,
                            "children": [],
                        }
                    ],
                }
            ],
        },
    )
    assert response.status_code == 200


def test_capture_persists_course_and_transcript_for_workspace_pages(client, auth_headers):
    token = create_plugin_token(client, auth_headers)
    capture_sample_course(client, token)

    transcript_response = client.post(
        "/api/v1/capture/transcript-segment",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "external_course_id": "course-1",
            "external_chapter_id": "1.1",
            "text": "欢迎学习供应链管理",
            "source": "dom-visible-text",
            "start_seconds": 0,
            "end_seconds": 8,
        },
    )
    assert transcript_response.status_code == 200

    courses = client.get("/api/v1/courses", headers=auth_headers).json()["items"]
    assert courses[0]["title"] == "供应链管理"
    assert courses[0]["chapter_count"] == 2

    transcripts = client.get("/api/v1/transcripts", headers=auth_headers).json()["items"]
    assert transcripts[0]["text"] == "欢迎学习供应链管理"
    assert transcripts[0]["course_title"] == "供应链管理"

    adapters = client.get("/api/v1/adapters", headers=auth_headers).json()["items"]
    assert adapters[0]["adapter_id"] == "wencai-school"


def test_duplicate_transcript_segment_is_not_inserted_twice(client, auth_headers):
    token = create_plugin_token(client, auth_headers)
    capture_sample_course(client, token)
    payload = {
        "external_course_id": "course-1",
        "external_chapter_id": "1.1",
        "text": "重复字幕",
        "source": "dom-visible-text",
        "start_seconds": 3,
        "end_seconds": 8,
    }

    first = client.post("/api/v1/capture/transcript-segment", headers={"Authorization": f"Bearer {token}"}, json=payload)
    second = client.post("/api/v1/capture/transcript-segment", headers={"Authorization": f"Bearer {token}"}, json=payload)

    assert first.status_code == 200
    assert second.status_code == 200
    assert first.json()["segment_id"] == second.json()["segment_id"]
    transcripts = client.get("/api/v1/transcripts", headers=auth_headers).json()["items"]
    assert len(transcripts) == 1


def test_capture_snapshot_merges_existing_adapter_host_patterns(client, auth_headers):
    create_response = client.post(
        "/api/v1/adapters",
        headers=auth_headers,
        json={
            "adapter_id": "wencai-school",
            "name": "Wencai School",
            "status": "enabled",
            "host_patterns": {"hosts": ["learning.wencaischool.net"]},
        },
    )
    assert create_response.status_code == 200

    token = create_plugin_token(client, auth_headers)
    capture_sample_course(client, token)

    adapters = client.get("/api/v1/adapters", headers=auth_headers).json()["items"]
    host_patterns = adapters[0]["host_patterns"]
    assert host_patterns["hosts"] == ["learning.wencaischool.net"]
    assert host_patterns["last_seen_url"] == "https://learning.wencaischool.net/openlearning/console/"


def test_notes_and_exports_have_workspace_lists(client, auth_headers):
    plugin_token = create_plugin_token(client, auth_headers)
    capture_sample_course(client, plugin_token)
    course_id = client.get("/api/v1/courses", headers=auth_headers).json()["items"][0]["id"]

    note_response = client.post(
        "/api/v1/notes",
        headers=auth_headers,
        json={"course_id": course_id, "content": "这里需要复习", "video_time_seconds": 12},
    )
    assert note_response.status_code == 200
    assert client.get("/api/v1/notes", headers=auth_headers).json()["items"][0]["content"] == "这里需要复习"

    export_response = client.post(
        "/api/v1/exports",
        headers=auth_headers,
        json={"course_id": course_id, "export_format": "markdown"},
    )
    assert export_response.status_code == 200
    assert export_response.json()["status"] == "completed"
    item = client.get("/api/v1/exports", headers=auth_headers).json()["items"][0]
    assert item["format"] == "markdown"
    assert item["file_path"]

    download = client.get(f"/api/v1/exports/{item['id']}/download", headers=auth_headers)
    assert download.status_code == 200
    assert "供应链管理" in download.text


def test_export_download_missing_returns_404(client, auth_headers):
    response = client.get("/api/v1/exports/not-a-real-id/download", headers=auth_headers)

    assert response.status_code == 404


def test_adapter_can_be_created_and_updated(client, auth_headers):
    create_response = client.post(
        "/api/v1/adapters",
        headers=auth_headers,
        json={
            "adapter_id": "generic-video",
            "name": "Generic Video",
            "status": "enabled",
            "host_patterns": {"hosts": ["example.com"]},
        },
    )

    assert create_response.status_code == 200
    assert create_response.json()["name"] == "Generic Video"

    update_response = client.put(
        "/api/v1/adapters/generic-video",
        headers=auth_headers,
        json={"name": "Generic Video Updated", "status": "disabled", "host_patterns": {"hosts": ["learn.example.com"]}},
    )

    assert update_response.status_code == 200
    assert update_response.json()["status"] == "disabled"
    adapters = client.get("/api/v1/adapters", headers=auth_headers).json()["items"]
    assert adapters[0]["name"] == "Generic Video Updated"


def test_settings_can_be_read_and_updated(client, auth_headers):
    initial = client.get("/api/v1/settings", headers=auth_headers)

    assert initial.status_code == 200
    assert "organization_name" in initial.json()
    assert "api_base_url" in initial.json()

    response = client.put(
        "/api/v1/settings",
        headers=auth_headers,
        json={"organization_name": "Commercial Workspace", "license_key": "LIC-456"},
    )

    assert response.status_code == 200
    assert response.json()["organization_name"] == "Commercial Workspace"
    assert response.json()["license_status"] == "active"


def test_note_correction_keeps_original_and_can_be_cleared(client, auth_headers):
    plugin_token = create_plugin_token(client, auth_headers)
    capture_sample_course(client, plugin_token)
    course_id = client.get("/api/v1/courses", headers=auth_headers).json()["items"][0]["id"]

    detail = client.get(f"/api/v1/courses/{course_id}/detail", headers=auth_headers).json()
    chapter_id = detail["chapters"][0]["children"][0]["id"]

    note = client.post(
        "/api/v1/notes",
        headers=auth_headers,
        json={"course_id": course_id, "chapter_id": chapter_id, "content": "学识名利、学识例行", "video_time_seconds": 220},
    ).json()

    corrected = client.patch(
        f"/api/v1/notes/{note['id']}/correction",
        headers=auth_headers,
        json={"corrected_content": "学史明理、学史力行"},
    )
    assert corrected.status_code == 200
    assert corrected.json()["content"] == "学识名利、学识例行"
    assert corrected.json()["corrected_content"] == "学史明理、学史力行"

    detail = client.get(f"/api/v1/courses/{course_id}/detail", headers=auth_headers).json()
    detail_note = detail["chapters"][0]["children"][0]["notes"][0]
    assert detail_note["content"] == "学识名利、学识例行"
    assert detail_note["corrected_content"] == "学史明理、学史力行"

    cleared = client.patch(
        f"/api/v1/notes/{note['id']}/correction",
        headers=auth_headers,
        json={"corrected_content": ""},
    )
    assert cleared.status_code == 200
    assert cleared.json()["corrected_content"] is None


def test_note_correction_returns_404_for_unknown_note(client, auth_headers):
    response = client.patch(
        "/api/v1/notes/no-such-note/correction",
        headers=auth_headers,
        json={"corrected_content": "x"},
    )
    assert response.status_code == 404


def test_manual_course_creation_and_note_with_chapter_and_tags(client, auth_headers):
    created = client.post("/api/v1/courses", headers=auth_headers, json={"title": "中共党史(手动)"})
    assert created.status_code == 200
    course = created.json()
    assert course["site_name"] == "手动创建"
    assert course["adapter_id"] == "manual"

    listed = client.get("/api/v1/courses", headers=auth_headers).json()["items"]
    assert any(item["id"] == course["id"] for item in listed)

    note = client.post(
        "/api/v1/notes",
        headers=auth_headers,
        json={"course_id": course["id"], "content": "党史学习方法", "tags": ["考点", "简答"]},
    )
    assert note.status_code == 200
    assert note.json()["tags"] == ["考点", "简答"]

    updated = client.patch(
        f"/api/v1/notes/{note.json()['id']}/tags",
        headers=auth_headers,
        json={"tags": ["高频"]},
    )
    assert updated.status_code == 200
    assert updated.json()["tags"] == ["高频"]

    assert client.patch(
        "/api/v1/notes/no-such-note/tags",
        headers=auth_headers,
        json={"tags": []},
    ).status_code == 404


def test_note_tags_visible_in_course_detail(client, auth_headers):
    plugin_token = create_plugin_token(client, auth_headers)
    capture_sample_course(client, plugin_token)
    course_id = client.get("/api/v1/courses", headers=auth_headers).json()["items"][0]["id"]
    detail = client.get(f"/api/v1/courses/{course_id}/detail", headers=auth_headers).json()
    chapter_id = detail["chapters"][0]["children"][0]["id"]

    client.post(
        "/api/v1/notes",
        headers=auth_headers,
        json={"course_id": course_id, "chapter_id": chapter_id, "content": "带标签的笔记", "tags": ["多选"]},
    )

    detail = client.get(f"/api/v1/courses/{course_id}/detail", headers=auth_headers).json()
    note = detail["chapters"][0]["children"][0]["notes"][0]
    assert note["tags"] == ["多选"]


def test_note_edit_replaces_content_and_clears_correction(client, auth_headers):
    plugin_token = create_plugin_token(client, auth_headers)
    capture_sample_course(client, plugin_token)
    course_id = client.get("/api/v1/courses", headers=auth_headers).json()["items"][0]["id"]
    detail = client.get(f"/api/v1/courses/{course_id}/detail", headers=auth_headers).json()
    chapter_id = detail["chapters"][0]["children"][0]["id"]

    note = client.post(
        "/api/v1/notes",
        headers=auth_headers,
        json={"course_id": course_id, "chapter_id": chapter_id, "content": "原始内容", "video_time_seconds": 10},
    ).json()
    client.patch(f"/api/v1/notes/{note['id']}/correction", headers=auth_headers, json={"corrected_content": "勘误内容"})

    edited = client.patch(f"/api/v1/notes/{note['id']}", headers=auth_headers, json={"content": "直接编辑后的内容"})

    assert edited.status_code == 200
    assert edited.json()["content"] == "直接编辑后的内容"
    # 直接编辑会清除旧的勘误内容,与「勘误」保留原文的语义区分
    assert edited.json()["corrected_content"] is None

    assert client.patch("/api/v1/notes/no-such-note", headers=auth_headers, json={"content": "x"}).status_code == 404
    assert client.patch(f"/api/v1/notes/{note['id']}", headers=auth_headers, json={"content": "   "}).status_code == 422


def test_chapter_memo_save_and_read(client, auth_headers):
    plugin_token = create_plugin_token(client, auth_headers)
    capture_sample_course(client, plugin_token)
    course_id = client.get("/api/v1/courses", headers=auth_headers).json()["items"][0]["id"]
    detail = client.get(f"/api/v1/courses/{course_id}/detail", headers=auth_headers).json()
    chapter_id = detail["chapters"][0]["children"][0]["id"]

    empty = client.get(f"/api/v1/courses/chapters/{chapter_id}/memo", headers=auth_headers)
    assert empty.status_code == 200
    assert empty.json()["content_md"] == ""

    saved = client.put(
        f"/api/v1/courses/chapters/{chapter_id}/memo",
        headers=auth_headers,
        json={"content_md": "## 总结\n本章要点"},
    )
    assert saved.status_code == 200
    assert saved.json()["content_md"] == "## 总结\n本章要点"

    read = client.get(f"/api/v1/courses/chapters/{chapter_id}/memo", headers=auth_headers)
    assert read.status_code == 200
    assert read.json()["content_md"] == "## 总结\n本章要点"

    missing = client.put("/api/v1/courses/chapters/no-such-chapter/memo", headers=auth_headers, json={"content_md": "x"})
    assert missing.status_code == 404
