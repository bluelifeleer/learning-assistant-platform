"""导入源：协议 + `.lapkg` 解析。

只做「读包 → 校验 → 解析成导入计划」，不碰数据库——
这样 dry-run 与正式导入复用同一份解析结果，也方便单元测试。

规范见 docs/superpowers/specs/2026-10-28-import-export-package.md 第 4、7、8、12 节。
"""

from __future__ import annotations

import csv
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
    #: lapkg / anki_tsv / csv —— 便于在报告里说明来源
    source_type: str = "lapkg"

    @property
    def media_by_arcname(self) -> dict[str, MediaEntry]:
        return {entry.arcname: entry for entry in self.media}


class ImportSource(Protocol):
    """所有导入源（.lapkg、Anki TSV、CSV）都实现这一个方法。"""

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
                source_type=self.source_type,
            )


def open_archive(plan: ImportPlan) -> zipfile.ZipFile:
    """重新打开包，用于按需流式读取媒体。"""
    return zipfile.ZipFile(io.BytesIO(plan.archive_bytes))


# ---------------------------------------------------------------------------
# 文本类导入源：Anki TSV / CSV
#
# 这两类没有课程结构，因此统一落到一个「按来源命名的课程」里：
# 重复导入会命中同一门课程并走 merge 去重，不会产生一堆同名课程。
# ---------------------------------------------------------------------------

MAX_TEXT_BYTES = 20 * 1024 * 1024
_CARD_HEADERS = {"front", "back", "question", "answer", "正面", "背面", "问题", "答案"}
_NOTE_HEADERS = {"content", "note", "text", "正文", "笔记", "内容"}
_TAG_HEADERS = {"tags", "tag", "标签"}
_TIME_HEADERS = {"time", "video_time", "video_time_seconds", "时间点", "时间"}
_BR_TAG = re.compile(r"<br\s*/?>", re.IGNORECASE)
_ANY_TAG = re.compile(r"<[^>]+>")
_TAG_SPLIT = re.compile(r"[;,|、\s]+")


def _decode_text(blob: bytes, filename_hint: str = "文件") -> str:
    if not blob:
        raise ImportValidationError(f"{filename_hint}是空文件")
    if len(blob) > MAX_TEXT_BYTES:
        raise ImportValidationError(f"{filename_hint}超过上限（{MAX_TEXT_BYTES // 1024 // 1024} MB）")
    for encoding in ("utf-8-sig", "utf-8", "gb18030"):
        try:
            return blob.decode(encoding)
        except UnicodeDecodeError:
            continue
    raise ImportValidationError("文件编码无法识别，请另存为 UTF-8 或 GB18030")


def _strip_html(value: str) -> str:
    text = _BR_TAG.sub("\n", value)
    text = _ANY_TAG.sub("", text)
    return (
        text.replace("&nbsp;", " ")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", '"')
        .replace("&#39;", "'")
        .replace("&amp;", "&")
        .strip()
    )


def _parse_time_value(value: str) -> float | None:
    text = (value or "").strip()
    if not text:
        return None
    try:
        if ":" in text:
            seconds = 0.0
            for part in text.split(":"):
                seconds = seconds * 60 + float(part)
            return seconds
        return float(text)
    except ValueError:
        return None


def _split_tags(value: str) -> list[str]:
    return [tag for tag in _TAG_SPLIT.split(_strip_html(value)) if tag]


def _synthetic_course(adapter_id: str, title: str, external_id: str) -> CourseDocument:
    return CourseDocument(
        document={
            "id": "",
            "site": {"adapter_id": adapter_id, "name": title, "host_patterns": {}},
            "external_course_id": external_id,
            "title": title,
            "term": None,
            "metadata": {},
            "archived": False,
            "chapters": [],
            "summary": None,
            "notes": [],
            "screenshots": [],
            "note_images": [],
        }
    )


class AnkiTsvSource:
    """Anki 纯文本导出（`front<TAB>back`），也接受 `#separator` / `#tags column` 指令。"""

    source_type = "anki_tsv"

    def parse(self, blob: bytes) -> ImportPlan:
        text = _decode_text(blob, "TSV 文件")
        separator = "\t"
        tags_column: int | None = None
        cards: list[dict] = []
        seen: set[str] = set()

        for raw_line in text.splitlines():
            line = raw_line.rstrip("\r\n")
            if not line.strip():
                continue
            if line.startswith("#"):
                lowered = line.lower()
                if lowered.startswith("#separator:"):
                    value = lowered.split(":", 1)[1].strip()
                    separator = {"tab": "\t", "comma": ",", "semicolon": ";"}.get(value, separator)
                elif lowered.startswith("#tags column:"):
                    try:
                        tags_column = int(lowered.split(":", 1)[1].strip())
                    except ValueError:
                        tags_column = None
                continue

            columns = line.split(separator)
            if len(columns) < 2:
                continue
            front = _strip_html(columns[0])
            back = _strip_html(columns[1])
            if not front or front in seen:
                continue
            seen.add(front)
            card = {"id": "", "front": front, "back": back, "chapter_id": None, "note_id": None}
            if tags_column and len(columns) >= tags_column and columns[tags_column - 1].strip():
                card["tags"] = _split_tags(columns[tags_column - 1])
            cards.append(card)

        if not cards:
            raise ImportValidationError("TSV 里没有可用的卡片（需要至少两列：正面<TAB>背面）")

        course = _synthetic_course("anki-import", "Anki 导入的卡片", "anki-import")
        course.cards = cards
        return ImportPlan(
            schema_version=SUPPORTED_SCHEMA_VERSION,
            app_version=None,
            exported_at=None,
            organization={},
            counts={"courses": 1, "cards": len(cards)},
            courses=[course],
            media=[],
            archive_bytes=b"",
            source_type=self.source_type,
        )


class CsvSource:
    """CSV 笔记 / 卡片。

    表头识别（大小写与中英文都认）：front/back → 卡片；content/note/text → 笔记；
    可选 tags（标签）与 time（时间点，支持 90 或 01:30）。没有表头时：
    单列按笔记、多列按「正面, 背面」处理。
    """

    source_type = "csv"

    def parse(self, blob: bytes) -> ImportPlan:
        text = _decode_text(blob, "CSV 文件")
        delimiter = self._sniff_delimiter(text)
        rows = [row for row in csv.reader(io.StringIO(text), delimiter=delimiter) if any(cell.strip() for cell in row)]
        if not rows:
            raise ImportValidationError("CSV 是空的")

        header = [cell.strip().lower() for cell in rows[0]]
        has_header = any(cell in _CARD_HEADERS | _NOTE_HEADERS | _TAG_HEADERS | _TIME_HEADERS for cell in header)
        index = self._index_headers(header) if has_header else {}
        body = rows[1:] if has_header else rows

        if has_header and "front" in index and "back" in index:
            return self._cards_plan(body, index)
        if not has_header and body and len(body[0]) >= 2:
            return self._cards_plan(body, {"front": 0, "back": 1})
        if has_header and "content" not in index:
            raise ImportValidationError("CSV 表头里没有 content/front 等可用列")
        return self._notes_plan(body, index)

    @staticmethod
    def _sniff_delimiter(text: str) -> str:
        first_line = next((line for line in text.splitlines() if line.strip()), "")
        counts = {candidate: first_line.count(candidate) for candidate in (",", ";", "\t")}
        best = max(counts, key=lambda key: counts[key])
        return best if counts[best] > 0 else ","

    @staticmethod
    def _index_headers(header: list[str]) -> dict[str, int]:
        aliases = {
            "front": {"front", "正面", "问题", "question"},
            "back": {"back", "背面", "答案", "answer"},
            "content": _NOTE_HEADERS,
            "tags": _TAG_HEADERS,
            "time": _TIME_HEADERS,
        }
        index: dict[str, int] = {}
        for position, cell in enumerate(header):
            for key, names in aliases.items():
                if cell in names and key not in index:
                    index[key] = position
        return index

    @staticmethod
    def _cell(row: list[str], index: dict[str, int], key: str) -> str:
        position = index.get(key)
        if position is None or position >= len(row):
            return ""
        return row[position].strip()

    def _cards_plan(self, rows: list[list[str]], index: dict[str, int]) -> ImportPlan:
        cards: list[dict] = []
        seen: set[str] = set()
        for row in rows:
            front = _strip_html(self._cell(row, index, "front"))
            back = _strip_html(self._cell(row, index, "back"))
            if not front or front in seen:
                continue
            seen.add(front)
            cards.append({"id": "", "front": front, "back": back, "chapter_id": None, "note_id": None})
        if not cards:
            raise ImportValidationError("CSV 里没有可用的卡片（正面列不能为空）")

        course = _synthetic_course("csv-import", "CSV 导入的卡片", "csv-import")
        course.cards = cards
        return self._plan(course, {"courses": 1, "cards": len(cards)})

    def _notes_plan(self, rows: list[list[str]], index: dict[str, int]) -> ImportPlan:
        notes: list[dict] = []
        seen: set[str] = set()
        for row in rows:
            content = _strip_html(self._cell(row, index, "content")) if index else _strip_html(" ".join(row))
            if not content or content in seen:
                continue
            seen.add(content)
            note = {
                "id": "",
                "user_id": "",
                "chapter_id": None,
                "video_time_seconds": _parse_time_value(self._cell(row, index, "time")),
                "content": content,
                "corrected_content": None,
                "tags": _split_tags(self._cell(row, index, "tags")),
                "created_at": None,
            }
            notes.append(note)
        if not notes:
            raise ImportValidationError("CSV 里没有可用的笔记（content 列不能为空）")

        course = _synthetic_course("csv-import", "CSV 导入的笔记", "csv-import")
        course.document["notes"] = notes
        return self._plan(course, {"courses": 1, "notes": len(notes)})

    def _plan(self, course: CourseDocument, counts: dict[str, int]) -> ImportPlan:
        return ImportPlan(
            schema_version=SUPPORTED_SCHEMA_VERSION,
            app_version=None,
            exported_at=None,
            organization={},
            counts=counts,
            courses=[course],
            media=[],
            archive_bytes=b"",
            source_type=self.source_type,
        )


def source_for_filename(filename: str) -> ImportSource:
    """按扩展名选导入源；不支持的类型直接报错（由路由转成 400）。"""
    suffix = ("." + filename.rsplit(".", 1)[-1].lower()) if "." in filename else ""
    if suffix in {".lapkg", ".zip"}:
        return LapkgSource()
    if suffix in {".tsv", ".txt"}:
        return AnkiTsvSource()
    if suffix == ".csv":
        return CsvSource()
    raise ImportValidationError(f"不支持的文件类型：{suffix or filename}（可用 .lapkg / .zip / .tsv / .txt / .csv）")
