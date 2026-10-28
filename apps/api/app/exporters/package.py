"""把 ExportBundle 写成 `.lapkg`（zip）。

约定：`manifest.json` **最后写入**——
包只要缺 manifest 就说明没写完，导入端可以直接判定包损坏，不需要额外校验标志位。
"""

from __future__ import annotations

import hashlib
import json
import zipfile
from pathlib import Path
from typing import Any

from app.services.export_payload import SCHEMA_VERSION, ExportBundle, isoformat

MANIFEST_NAME = "manifest.json"
CHUNK_BYTES = 1024 * 1024


def _json_bytes(payload: Any) -> bytes:
    return json.dumps(payload, ensure_ascii=False, indent=2).encode("utf-8")


def _add_bytes(archive: zipfile.ZipFile, arcname: str, data: bytes, checksums: dict[str, str]) -> None:
    archive.writestr(arcname, data)
    checksums[arcname] = "sha256:" + hashlib.sha256(data).hexdigest()


def _add_file(archive: zipfile.ZipFile, arcname: str, path: Path, checksums: dict[str, str]) -> int:
    digest = hashlib.sha256()
    written = 0
    with path.open("rb") as source, archive.open(arcname, "w") as target:
        while chunk := source.read(CHUNK_BYTES):
            digest.update(chunk)
            target.write(chunk)
            written += len(chunk)
    checksums[arcname] = "sha256:" + digest.hexdigest()
    return written


def write_package(path: Path, bundle: ExportBundle, *, app_version: str) -> dict[str, Any]:
    """写出包文件，返回写入统计（供 exports.scope_counts 使用）。"""
    checksums: dict[str, str] = {}
    media_bytes = 0
    path.parent.mkdir(parents=True, exist_ok=True)

    with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED, allowZip64=True) as archive:
        for course in bundle.courses:
            course_id = course.document["id"]
            _add_bytes(archive, f"courses/{course_id}/course.json", _json_bytes(course.document), checksums)
            for chapter_id, chapter in course.chapters.items():
                _add_bytes(
                    archive,
                    f"courses/{course_id}/chapters/{chapter_id}.json",
                    _json_bytes(chapter),
                    checksums,
                )
            if course.cards:
                _add_bytes(archive, f"courses/{course_id}/cards.json", _json_bytes(course.cards), checksums)
            if course.quiz:
                _add_bytes(archive, f"courses/{course_id}/quiz.json", _json_bytes(course.quiz), checksums)

        for media in bundle.media:
            media_bytes += _add_file(archive, media.arcname, media.path, checksums)

        manifest = {
            "schema_version": SCHEMA_VERSION,
            "app_version": app_version,
            "exported_at": isoformat(bundle.exported_at),
            "organization": {"id": bundle.organization_id, "name": bundle.organization_name},
            "scope": {"type": "courses", "course_count": len(bundle.courses)},
            "counts": dict(bundle.counts),
            "media": {
                "included": bundle.include_media,
                "file_count": len(bundle.media),
                "bytes": media_bytes,
                "missing_count": len(bundle.missing_media),
                "missing": bundle.missing_media[:50],
            },
            "checksums": checksums,
        }
        # 不给自己算 checksum（manifest 里写 manifest 的哈希是不可能自洽的）
        archive.writestr(MANIFEST_NAME, _json_bytes(manifest))

    # 对象统计直接摊平：导出列表/详情要按 courses、chapters 之类取数
    return {
        **bundle.counts,
        "media": {
            "files": len(bundle.media),
            "bytes": media_bytes,
            "missing": len(bundle.missing_media),
        },
        "checksum_entries": len(checksums),
    }


def read_manifest(path: Path) -> dict[str, Any]:
    """读回包里的 manifest（验证与导入都从这里入口）。"""
    with zipfile.ZipFile(path) as archive:
        return json.loads(archive.read(MANIFEST_NAME).decode("utf-8"))
