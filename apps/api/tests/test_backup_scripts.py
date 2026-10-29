"""备份/恢复脚本的可测部分：env 解析、校验和、清理策略、清单字段、失败前置检查。

真正的 pg_dump / pg_restore 需要 Docker，这里只覆盖不需要 Docker 的逻辑，
保证脚本"坏数据要拦住、过期备份要清掉"这些行为不会退化。
"""

from __future__ import annotations

import importlib.util
import sys
import tarfile
from datetime import UTC, datetime
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[3]
SCRIPTS = REPO_ROOT / "scripts"


def _load(name: str):
    if str(SCRIPTS) not in sys.path:
        sys.path.insert(0, str(SCRIPTS))
    # 用真实模块名加载，保证 restore 里 `from backup import ...` 拿到的是同一份模块，
    # 异常类也才是同一个（否则 pytest.raises 抓不到）
    spec = importlib.util.spec_from_file_location(name, SCRIPTS / f"{name}.py")
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


backup = _load("backup")
restore = _load("restore")


def test_parse_env_file_handles_quotes_comments_and_export(tmp_path: Path) -> None:
    env = tmp_path / ".env.production"
    env.write_text(
        "\n".join(
            [
                "# 注释行",
                "POSTGRES_DB=learn_assistant",
                "POSTGRES_USER='learn_user'",
                'POSTGRES_PASSWORD="p@ss word"  # 行尾注释',
                "export WEB_PORT=8080",
                "BAD_LINE_WITHOUT_EQUALS",
                "",
            ]
        ),
        encoding="utf-8",
    )

    values = backup.parse_env_file(env)

    assert values["POSTGRES_DB"] == "learn_assistant"
    assert values["POSTGRES_USER"] == "learn_user"
    assert values["POSTGRES_PASSWORD"] == "p@ss word"
    assert values["WEB_PORT"] == "8080"
    assert "BAD_LINE_WITHOUT_EQUALS" not in values


def test_backup_dir_name_is_sortable() -> None:
    name = backup.backup_dir_name(datetime(2026, 10, 29, 20, 0, 5, tzinfo=UTC))

    assert name == "learn-assistant-20261029-200005"


def test_checksums_detect_tampering(tmp_path: Path) -> None:
    (tmp_path / "db.dump").write_bytes(b"fake dump")
    (tmp_path / "media.tar.gz").write_bytes(b"fake media")
    backup.write_checksums(tmp_path)

    assert backup.verify_checksums(tmp_path) == []

    (tmp_path / "db.dump").write_bytes(b"tampered")
    problems = backup.verify_checksums(tmp_path)

    assert len(problems) == 1
    assert "校验失败：db.dump" in problems[0]


def test_verify_checksums_reports_missing_file(tmp_path: Path) -> None:
    (tmp_path / "db.dump").write_bytes(b"x")
    (tmp_path / "media.tar.gz").write_bytes(b"y")
    backup.write_checksums(tmp_path)
    (tmp_path / "media.tar.gz").unlink()

    problems = backup.verify_checksums(tmp_path)

    assert any("缺少文件：media.tar.gz" in item for item in problems)


def test_prune_keeps_newest_backups(tmp_path: Path) -> None:
    for stamp in ("20260101-000000", "20260102-000000", "20260103-000000"):
        (tmp_path / f"learn-assistant-{stamp}").mkdir()
    (tmp_path / "unrelated").mkdir()

    removed = backup.prune_old_backups(tmp_path, keep=2)

    assert [path.name for path in removed] == ["learn-assistant-20260101-000000"]
    assert (tmp_path / "learn-assistant-20260102-000000").is_dir()
    assert (tmp_path / "learn-assistant-20260103-000000").is_dir()
    # 不相关目录不动
    assert (tmp_path / "unrelated").is_dir()


def test_prune_with_zero_keeps_everything(tmp_path: Path) -> None:
    (tmp_path / "learn-assistant-20260101-000000").mkdir()

    assert backup.prune_old_backups(tmp_path, keep=0) == []
    assert (tmp_path / "learn-assistant-20260101-000000").is_dir()


def test_manifest_records_sizes_and_revision() -> None:
    manifest = backup.build_manifest(
        created_at=datetime(2026, 10, 29, 20, 0, 0, tzinfo=UTC),
        db_name="learn_assistant",
        db_bytes=1024,
        media_bytes=2048,
        media_files=7,
        alembic_revision="0024_import_target_course",
    )

    assert manifest["database"] == "learn_assistant"
    assert manifest["media_files"] == 7
    assert manifest["alembic_revision"] == "0024_import_target_course"
    assert manifest["files"] == ["db.dump", "media.tar.gz"]


def test_count_media_files(tmp_path: Path) -> None:
    source = tmp_path / "payload"
    (source / "exports").mkdir(parents=True)
    (source / "exports" / "a.lapkg").write_bytes(b"1")
    (source / "exports" / "b.md").write_bytes(b"2")
    archive = tmp_path / "media.tar.gz"
    with tarfile.open(archive, "w:gz") as tar:
        tar.add(source / "exports", arcname="exports")

    assert backup.count_media_files(archive) == 2
    assert backup.count_media_files(tmp_path / "missing.tar.gz") == 0


def test_preflight_requires_env_file(tmp_path: Path) -> None:
    compose_file = tmp_path / "docker-compose.prod.yml"
    compose_file.write_text("services: {}\n", encoding="utf-8")

    with pytest.raises(backup.BackupError, match="找不到环境文件"):
        backup.preflight(compose_file, tmp_path / "missing.env")


def test_restore_rejects_incomplete_directory(tmp_path: Path) -> None:
    (tmp_path / "db.dump").write_bytes(b"x")
    (tmp_path / "manifest.json").write_text("{}", encoding="utf-8")

    with pytest.raises(backup.BackupError, match="备份不完整"):
        restore.restore(
            tmp_path,
            compose_file=tmp_path / "compose.yml",
            env_file=tmp_path / ".env",
            assume_yes=True,
        )


def test_restore_rejects_bad_checksum_before_touching_docker(tmp_path: Path) -> None:
    (tmp_path / "db.dump").write_bytes(b"x")
    (tmp_path / "media.tar.gz").write_bytes(b"y")
    (tmp_path / "manifest.json").write_text("{}", encoding="utf-8")
    backup.write_checksums(tmp_path)
    (tmp_path / "media.tar.gz").write_bytes(b"tampered")

    with pytest.raises(backup.BackupError, match="校验失败"):
        restore.restore(
            tmp_path,
            compose_file=tmp_path / "compose.yml",
            env_file=tmp_path / ".env",
            assume_yes=True,
        )
