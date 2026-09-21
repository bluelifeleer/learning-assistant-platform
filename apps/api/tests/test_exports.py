from app.exporters.json_export import render_course_json
from app.exporters.markdown import render_course_markdown


def sample_course() -> dict:
    return {
        "title": "供应链管理",
        "chapters": [
            {
                "title": "1.1 课程导论",
                "transcripts": [
                    {"start_seconds": 0, "text": "欢迎学习供应链管理"},
                    {"start_seconds": 8.5, "text": "本节介绍课程结构"},
                ],
                "notes": [{"video_time_seconds": 12, "content": "这里要复习"}],
            }
        ],
    }


def test_markdown_export_contains_transcripts_and_notes() -> None:
    output = render_course_markdown(sample_course())

    assert "# 供应链管理" in output
    assert "- 00:00 欢迎学习供应链管理" in output
    assert "- 00:12 这里要复习" in output


def test_json_export_is_stable() -> None:
    output = render_course_json(sample_course())

    assert '"title": "供应链管理"' in output
    assert '"text": "欢迎学习供应链管理"'


def test_anki_tsv_renders_front_back_pairs() -> None:
    from app.exporters.anki import render_anki_tsv

    output = render_anki_tsv(
        [
            {"front": "问题一", "back": "答案一"},
            {"front": "含\t制表符", "back": "第一行\n第二行"},
        ]
    )

    lines = output.rstrip("\n").split("\n")
    assert lines[0] == "问题一\t答案一"
    assert lines[1] == "含 制表符\t第一行<br>第二行"


def test_anki_tsv_empty_renders_empty_string() -> None:
    from app.exporters.anki import render_anki_tsv

    assert render_anki_tsv([]) == ""


def test_anki_export_uses_review_cards(client, auth_headers) -> None:
    token = client.post("/api/v1/plugin-tokens", json={"name": "Edge local"}, headers=auth_headers).json()["token"]
    client.post(
        "/api/v1/capture/course-snapshot",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "adapter_id": "wencai-school",
            "site_url": "https://learning.wencaischool.net/openlearning/console/",
            "external_course_id": "course-1",
            "course_title": "供应链管理",
            "chapters": [{"external_chapter_id": "1.1", "title": "1.1 课程主要内容", "sort_order": 1, "children": []}],
        },
    )
    note = client.post(
        "/api/v1/capture/note",
        headers={"Authorization": f"Bearer {token}"},
        json={"external_course_id": "course-1", "external_chapter_id": "1.1", "content": "关键概念"},
    )
    course_id = client.get("/api/v1/courses", headers=auth_headers).json()["items"][0]["id"]
    client.post("/api/v1/review/cards", headers=auth_headers, json={"note_id": note.json()["note_id"]})

    export_response = client.post("/api/v1/exports", headers=auth_headers, json={"course_id": course_id, "export_format": "anki"})

    assert export_response.status_code == 200
    assert export_response.json()["status"] == "completed"
    item = client.get("/api/v1/exports", headers=auth_headers).json()["items"][0]
    assert item["format"] == "anki"
    assert item["file_path"].endswith(".tsv")
    download = client.get(f"/api/v1/exports/{item['id']}/download", headers=auth_headers)
    assert download.status_code == 200
    assert download.text.startswith("关键概念\t")


def test_anki_export_falls_back_to_notes_without_cards(client, auth_headers) -> None:
    token = client.post("/api/v1/plugin-tokens", json={"name": "Edge local"}, headers=auth_headers).json()["token"]
    client.post(
        "/api/v1/capture/course-snapshot",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "adapter_id": "wencai-school",
            "site_url": "https://learning.wencaischool.net/openlearning/console/",
            "external_course_id": "course-1",
            "course_title": "供应链管理",
            "chapters": [],
        },
    )
    client.post(
        "/api/v1/capture/note",
        headers={"Authorization": f"Bearer {token}"},
        json={"external_course_id": "course-1", "content": "裸笔记"},
    )
    course_id = client.get("/api/v1/courses", headers=auth_headers).json()["items"][0]["id"]

    export_response = client.post("/api/v1/exports", headers=auth_headers, json={"course_id": course_id, "export_format": "anki"})

    assert export_response.status_code == 200
    item = client.get("/api/v1/exports", headers=auth_headers).json()["items"][0]
    download = client.get(f"/api/v1/exports/{item['id']}/download", headers=auth_headers)
    assert download.text == "裸笔记\t\n"


def test_export_rejects_unknown_format(client, auth_headers) -> None:
    response = client.post("/api/v1/exports", headers=auth_headers, json={"export_format": "pdf"})

    assert response.status_code == 400
