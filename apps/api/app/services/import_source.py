"""导入源：协议 + `.lapkg` 解析。

只做「读包 → 校验 → 解析成导入计划」，不碰数据库——
这样 dry-run 与正式导入复用同一份解析结果，也方便单元测试。

规范见 docs/superpowers/specs/2026-10-28-import-export-package.md 第 4、7、8、12 节。
"""

from __future__ import annotations

import hashlib
import io
import json
import re
import stat
import zipfile
from dataclasses import dataclass, field
from typing import Any, Protocol

MAX_PACKAGE_BYTES = 200 * 1024 * 1024
MAX_ENTRY_BYTES = 50 * 1024 * 1024
MAX_ENTRIES = 5000
MAX_TOTAL_UNCOMPRESSED_BYTES = 1024 * 1024 * 1024
SUPPORTED_SCHEMA_VERSION = 1
MEDIA_SUFFIXES = {".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp"}
MANIFEST_NAME = "manifest.json"
CHUNK_BYTES = 1024 * 1024
_DRIVE_PREFIX = re.compile(r"^[A-Za-z]:")


class ImportValidationError(Exception):
    """包本身不可用：结构、版本、校验和或限额不通过。"""


@dataclass
class MediaEntry:
    arcname: str
    size: int
    sha256: str

    @property
    def suffix(self) -> str:
        return ("." + self.arcname.rsplit(".", 1)[-1].lower()) if "." in self.arcname else ""


@dataclass
class CourseDocument:
    document: dict
    chapters: dict[str, dict] = field(default_factory=dict)
    cards: list[dict] = field(default_factory=list)
    quiz: list[dict] = field(default_factory=list)

    @property
    def course_id(self) -> str:
        return str(self.document.get("id") or "")


@dataclass
class ImportPlan:
    schema_version: int
    app_version: str | None
    exported_at: str | None
    organization: dict
    #: 包内声明的对象数（用于导入后核对）
    counts: dict[str, int]
    courses: list[CourseDocument] = field(default_factory=list)
    media: list[MediaEntry] = field(default_factory=list)
    archive_bytes: bytes = field(default=b"", repr=False)

    @property
    def media_by_arcname(self) -> dict[str, MediaEntry]:
        return {entry.arcname: entry for entry in self.media}


class ImportSource(Protocol):
    """所有导入源（.lapkg、以后的 Anki / CSV）都实现这一个方法。"""

    source_type: str

    def parse(self, blob: bytes) -> ImportPlan: ...


def _validate_entry_name(name: str) -> str:
    normalized = name.replace("\\", "/").strip()
    if not normalized:
        raise ImportValidationError("包内存在空文件名")
    if normalized.startswith("/") or _DRIVE_PREFIX.match(normalized):
        raise ImportValidationError(f"包内路径非法（绝对路径）：{name}")
    if ".." in normalized.split("/"):
        raise ImportValidationError(f"包内路径非法（路径穿越）：{name}")
    return normalized


def _is_media(name: str) -> bool:
    if not name.startswith("media/"):
        return False
    return any(name.lower().endswith(suffix) for suffix in MEDIA_SUFFIXES)


def _is_supported(name: str) -> bool:
    return name == MANIFEST_NAME or name.endswith(".json") or _is_media(name)


def _load_json(archive: zipfile.ZipFile, name: str) -> Any:
    try:
        raw = archive.read(name)
    except KeyError as exc:  # pragma: no cover - 调用方已先校验存在
        raise ImportValidationError(f"包内缺少文件：{name}") from exc
    try:
        return json.loads(raw.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise ImportValidationError(f"{name} 不是合法的 UTF-8 JSON") from exc


class LapkgSource:
    """`.lapkg`（zip + manifest.json）解析器。"""

    source_type = "lapkg"

    def parse(self, blob: bytes) -> ImportPlan:
        if not blob:
            raise ImportValidationError("上传的文件为空")
        if len(blob) > MAX_PACKAGE_BYTES:
            raise ImportValidationError(
                f"包体积超过上限（{len(blob) // 1024 // 1024} MB > {MAX_PACKAGE_BYTES // 1024 // 1024} MB）"
            )
        try:
            archive = zipfile.ZipFile(io.BytesIO(blob))
        except zipfile.BadZipFile as exc:
            raise ImportValidationError("不是有效的 zip 包（可能未导出完成或已损坏）") from exc

        with archive:
            infos = archive.infolist()
            if len(infos) > MAX_ENTRIES:
                raise ImportValidationError(f"包内条目数超过上限（{len(infos)} > {MAX_ENTRIES}）")

            total_uncompressed = 0
            file_names: list[str] = []
            for info in infos:
                name = _validate_entry_name(info.filename)
                if info.is_dir():
                    continue
                if stat.S_ISLNK(info.external_attr >> 16):
                    raise ImportValidationError(f"包内不允许符号链接：{name}")
                if info.file_size > MAX_ENTRY_BYTES:
                    raise ImportValidationError(f"单个文件超过上限：{name}")
                if not _is_supported(name):
                    raise ImportValidationError(f"不支持的文件类型：{name}")
                total_uncompressed += info.file_size
                file_names.append(name)
            if total_uncompressed > MAX_TOTAL_UNCOMPRESSED_BYTES:
                raise ImportValidationError("包解压后体积超过上限")

            if MANIFEST_NAME not in file_names:
                raise ImportValidationError("包里没有 manifest.json（可能导出未完成）")
            manifest = _load_json(archive, MANIFEST_NAME)
            if not isinstance(manifest, dict):
                raise ImportValidationError("manifest.json 结构不正确")
            schema_version = manifest.get("schema_version")
            if not isinstance(schema_version, int) or schema_version > SUPPORTED_SCHEMA_VERSION:
                raise ImportValidationError(
                    f"包格式版本不受支持（包 {schema_version}，服务端支持 {SUPPORTED_SCHEMA_VERSION}），请升级服务端"
                )

            checksums = manifest.get("checksums") or {}
            media: list[MediaEntry] = []
            for name in file_names:
                if name == MANIFEST_NAME:
                    continue
                expected = checksums.get(name)
                if _is_media(name):
                    digest = hashlib.sha256()
                    size = 0
                    with archive.open(name) as source:
                        while chunk := source.read(CHUNK_BYTES):
                            digest.update(chunk)
                            size += len(chunk)
                    actual = "sha256:" + digest.hexdigest()
                    if expected and expected != actual:
                        raise ImportValidationError(f"文件校验失败：{name}")
                    media.append(MediaEntry(arcname=name, size=size, sha256=actual))
                elif expected:
                    actual = "sha256:" + hashlib.sha256(archive.read(name)).hexdigest()
                    if expected != actual:
                        raise ImportValidationError(f"文件校验失败：{name}")

            courses: list[CourseDocument] = []
            for name in sorted(file_names):
                if not name.endswith("/course.json"):
                    continue
                base = name.rsplit("/", 1)[0]
                document = _load_json(archive, name)
                if not isinstance(document, dict):
                    raise ImportValidationError(f"{name} 结构不正确")
                bundle = CourseDocument(document=document)
                for chapter in document.get("chapters") or []:
                    chapter_id = str((chapter or {}).get("id") or "")
                    chapter_name = f"{base}/chapters/{chapter_id}.json"
                    if chapter_name in file_names:
                        bundle.chapters[chapter_id] = _load_json(archive, chapter_name)
                if f"{base}/cards.json" in file_names:
                    bundle.cards = _load_json(archive, f"{base}/cards.json") or []
                if f"{base}/quiz.json" in file_names:
                    bundle.quiz = _load_json(archive, f"{base}/quiz.json") or []
                courses.append(bundle)

            if not courses:
                raise ImportValidationError("包里没有课程（courses/*/course.json）")

            planned_counts = manifest.get("counts") or {}
            return ImportPlan(
                schema_version=schema_version,
                app_version=manifest.get("app_version"),
                exported_at=manifest.get("exported_at"),
                organization=manifest.get("organization") or {},
                counts={str(key): int(value or 0) for key, value in planned_counts.items()},
                courses=courses,
                media=media,
                archive_bytes=blob,
            )


def open_archive(plan: ImportPlan) -> zipfile.ZipFile:
    """重新打开包，用于按需流式读取媒体。"""
    return zipfile.ZipFile(io.BytesIO(plan.archive_bytes))
