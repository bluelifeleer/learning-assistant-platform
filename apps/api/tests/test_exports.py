import hashlib
import io
import json
from pathlib import Path
import tomllib
import zipfile

from app.exporters.json_export import render_course_json
from app.exporters.markdown import render_course_markdown
from app.services.export_payload import APP_VERSION
from tests.test_note_capture import capture_sample_course, create_plugin_token

TINY_JPEG_BASE64 = (
    "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAABAgMEBQYHCAkKCwwNDg8QERITFBUWFxgZGhscHR4fICEiIyQlJico"
    "KSorLC0uLzAxMjM0NTY3ODk6Ozw9Pj//wAARCAABAAEDASIAAhEBAxEB/8QAFAABAAAAAAAAAAAAAAAAAAAAAAAAAAD/"
    "2gAMAwEAAhEDEQA/ANLPIP/Z"
)


def capture_screenshot(client, token: str) -> None:
    response = client.post(
        "/api/v1/capture/screenshot",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "external_course_id": "course-1",
            "external_chapter_id": "1.1",
            "video_time_seconds": 12.5,
            "image_base64": f"data:image/jpeg;base64,{TINY_JPEG_BASE64}",
        },
    )
    assert response.status_code == 200


def capture_second_course(client, token: str) -> None:
    response = client.post(
        "/api/v1/capture/course-snapshot",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "adapter_id": "wencai-school",
            "site_url": "https://learning.wencaischool.net/openlearning/console/",
            "external_course_id": "course-2",
            "course_title": "运筹学",
            "chapters": [{"external_chapter_id": "2.1", "title": "2.1 线性规划", "sort_order": 1, "children": []}],
        },
    )
    assert response.status_code == 200


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


def test_markdown_export_labels_correction_and_keeps_original() -> None:
    course = sample_course()
    course["chapters"][0]["notes"] = [
        {"video_time_seconds": 220, "content": "学识名利、学识例行", "corrected_content": "学史明理、学史力行"},
        {"video_time_seconds": 12, "content": "这里要复习", "corrected_content": None},
    ]

    output = render_course_markdown(course)

    assert "- 03:40 【勘误】学史明理、学史力行" in output
    assert "  - 原文:学识名利、学识例行" in output
    assert "- 00:12 这里要复习" in output
    assert "【勘误】这里要复习" not in output


def test_json_export_includes_corrected_content() -> None:
    course = sample_course()
    course["chapters"][0]["notes"] = [
        {"video_time_seconds": 220, "content": "学识名利", "corrected_content": "学史明理"},
    ]

    output = render_course_json(course)

    assert '"content": "学识名利"' in output
    assert '"corrected_content": "学史明理"' in output


def test_markdown_export_includes_chapter_video_links() -> None:
    course = sample_course()
    course["chapters"][0]["video"] = {
        "page_url": "https://learning.example.com/course/1",
        "media_url": "https://cdn.example.com/1.1.mp4?sign=abc",
        "media_type": "file",
        "is_likely_signed": True,
    }

    output = render_course_markdown(course)

    assert "- 视频页面:https://learning.example.com/course/1" in output
    assert "- 媒体地址:https://cdn.example.com/1.1.mp4?sign=abc（签名/临时链接,可能已过期）" in output


def test_markdown_export_includes_note_tags() -> None:
    course = sample_course()
    course["chapters"][0]["notes"] = [
        {"video_time_seconds": 12, "content": "这里要复习", "tags": ["考点", "简答"]},
    ]

    output = render_course_markdown(course)

    assert "- 00:12 【考点】【简答】这里要复习" in output


# ---------------------------------------------------------------------------
# .lapkg 完整包（P0）
# ---------------------------------------------------------------------------


def _zip_of(blob: bytes) -> zipfile.ZipFile:
    return zipfile.ZipFile(io.BytesIO(blob))


def _export_and_download(client, headers, payload: dict) -> tuple[dict, bytes]:
    created = client.post("/api/v1/exports", headers=headers, json=payload)
    assert created.status_code == 200, created.text
    assert created.json()["status"] == "completed"
    listing = client.get("/api/v1/exports", headers=headers).json()["items"]
    item = next(row for row in listing if row["id"] == created.json()["id"])
    download = client.get(f"/api/v1/exports/{item['id']}/download", headers=headers)
    assert download.status_code == 200
    return item, download.content


def test_package_export_has_manifest_checksums_and_media(client, auth_headers) -> None:
    token = create_plugin_token(client, auth_headers)
    capture_sample_course(client, token)
    capture_screenshot(client, token)

    item, blob = _export_and_download(client, auth_headers, {"export_format": "package"})

    assert item["format"] == "package"
    assert item["file_path"].endswith(".lapkg")
    assert item["size_bytes"] and item["size_bytes"] == len(blob)
    assert item["progress"] == 100
    assert item["scope_counts"]["courses"] == 1
    assert item["scope_counts"]["chapters"] == 2
    assert item["scope_counts"]["screenshots"] == 1

    archive = _zip_of(blob)
    names = archive.namelist()
    assert "manifest.json" in names
    manifest = json.loads(archive.read("manifest.json"))
    assert manifest["schema_version"] == 1
    assert manifest["app_version"] == APP_VERSION
    assert manifest["scope"]["course_count"] == 1
    assert manifest["media"]["included"] is True
    assert manifest["media"]["file_count"] >= 1

    # 校验和必须与实际写入的字节一致，否则包不可信
    for name, digest in manifest["checksums"].items():
        assert "sha256:" + hashlib.sha256(archive.read(name)).hexdigest() == digest, name
    # manifest 不给自己算哈希
    assert "manifest.json" not in manifest["checksums"]

    assert any(name.startswith("media/screenshots/") for name in names)
    course_names = [name for name in names if name.endswith("/course.json")]
    assert len(course_names) == 1
    course = json.loads(archive.read(course_names[0]))
    assert course["title"] == "供应链管理"
    assert course["external_course_id"] == "course-1"
    assert course["site"]["adapter_id"] == "wencai-school"
    assert len(course["chapters"]) == 2


def test_package_export_can_skip_media(client, auth_headers) -> None:
    token = create_plugin_token(client, auth_headers)
    capture_sample_course(client, token)
    capture_screenshot(client, token)

    item, blob = _export_and_download(client, auth_headers, {"export_format": "package", "include_media": False})

    archive = _zip_of(blob)
    manifest = json.loads(archive.read("manifest.json"))
    assert manifest["media"]["included"] is False
    assert manifest["media"]["file_count"] == 0
    assert not any(name.startswith("media/") for name in archive.namelist())
    assert item["size_bytes"] == len(blob)


def test_package_export_covers_all_courses_when_none_selected(client, auth_headers) -> None:
    token = create_plugin_token(client, auth_headers)
    capture_sample_course(client, token)
    capture_second_course(client, token)

    item, blob = _export_and_download(client, auth_headers, {"export_format": "package"})

    assert item["scope_counts"]["courses"] == 2
    archive = _zip_of(blob)
    manifest = json.loads(archive.read("manifest.json"))
    assert manifest["scope"]["course_count"] == 2
    assert len([name for name in archive.namelist() if name.endswith("/course.json")]) == 2


def test_multi_course_is_only_allowed_for_package(client, auth_headers) -> None:
    token = create_plugin_token(client, auth_headers)
    capture_sample_course(client, token)
    capture_second_course(client, token)
    course_ids = [row["id"] for row in client.get("/api/v1/courses", headers=auth_headers).json()["items"]]

    response = client.post(
        "/api/v1/exports",
        headers=auth_headers,
        json={"course_ids": course_ids, "export_format": "markdown"},
    )

    assert response.status_code == 400


def test_export_read_endpoint_returns_job_details(client, auth_headers) -> None:
    token = create_plugin_token(client, auth_headers)
    capture_sample_course(client, token)
    item, _ = _export_and_download(client, auth_headers, {"export_format": "json"})

    response = client.get(f"/api/v1/exports/{item['id']}", headers=auth_headers)

    assert response.status_code == 200
    assert response.json()["id"] == item["id"]
    assert response.json()["format"] == "json"


def test_export_download_rejects_unknown_id(client, auth_headers) -> None:
    assert client.get("/api/v1/exports/does-not-exist/download", headers=auth_headers).status_code == 404
    assert client.get("/api/v1/exports/does-not-exist", headers=auth_headers).status_code == 404


def test_delete_export_removes_record_and_file(client, auth_headers) -> None:
    token = create_plugin_token(client, auth_headers)
    capture_sample_course(client, token)
    item, _ = _export_and_download(client, auth_headers, {"export_format": "json"})
    path = Path(item["file_path"])
    assert path.is_file()

    removed = client.delete(f"/api/v1/exports/{item['id']}", headers=auth_headers)

    assert removed.status_code == 204
    assert not path.exists()
    assert client.get(f"/api/v1/exports/{item['id']}", headers=auth_headers).status_code == 404
    assert client.delete("/api/v1/exports/does-not-exist", headers=auth_headers).status_code == 404


def test_app_version_matches_pyproject() -> None:
    """包里写的 app_version 必须和真实版本一致，否则迁移时会误判来源。"""
    pyproject = Path(__file__).resolve().parents[1] / "pyproject.toml"
    declared = tomllib.loads(pyproject.read_text(encoding="utf-8"))["project"]["version"]

    assert APP_VERSION == declared


def test_cleanup_keeps_only_recent_exports(client, auth_headers) -> None:
    token = create_plugin_token(client, auth_headers)
    capture_sample_course(client, token)
    course_id = client.get("/api/v1/courses", headers=auth_headers).json()["items"][0]["id"]
    for _ in range(3):
        _export_and_download(client, auth_headers, {"course_id": course_id, "export_format": "json"})
    before = client.get("/api/v1/exports", headers=auth_headers).json()["items"]
    paths = [Path(item["file_path"]) for item in before]
    assert len(before) == 3 and all(path.is_file() for path in paths)

    response = client.post("/api/v1/exports/cleanup", params={"keep_count": 1}, headers=auth_headers)

    assert response.status_code == 200
    stats = response.json()
    assert stats["deleted"] == 2
    assert stats["kept"] == 1
    assert stats["files_removed"] == 2
    remaining = client.get("/api/v1/exports", headers=auth_headers).json()["items"]
    assert len(remaining) == 1
    # 被删的文件确实不在磁盘上了
    assert sum(1 for path in paths if path.is_file()) == 1


def test_cleanup_without_policy_deletes_nothing(client, auth_headers) -> None:
    token = create_plugin_token(client, auth_headers)
    capture_sample_course(client, token)
    course_id = client.get("/api/v1/courses", headers=auth_headers).json()["items"][0]["id"]
    _export_and_download(client, auth_headers, {"course_id": course_id, "export_format": "json"})

    response = client.post("/api/v1/exports/cleanup", params={"keep_count": 0, "keep_days": 0}, headers=auth_headers)

    assert response.status_code == 200
    assert response.json()["deleted"] == 0
    assert len(client.get("/api/v1/exports", headers=auth_headers).json()["items"]) == 1
