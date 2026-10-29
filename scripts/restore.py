"""从 scripts/backup.py 产出的目录恢复：校验 → 确认 → 重建库 → 解包媒体 → 启动。

用法：
    python scripts/restore.py backups/learn-assistant-20261029-200000
    python scripts/restore.py <dir> --yes          # 跳过确认（自动化/演练）

会做这些事，顺序固定：
1. 校验 checksums.sha256，任何一个不对就中止
2. 打印清单（时间、库名、alembic 版本、媒体文件数）并让确认
3. 停掉 api / web，避免恢复期间还有写入
4. 重建 public schema，再 pg_restore --no-owner
5. 用一次性容器把 media.tar.gz 解回 /data
6. 重新拉起 api / web（入口会跑 alembic upgrade head）
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from backup import (
    DEFAULT_COMPOSE_FILE,
    DEFAULT_ENV_FILE,
    BackupError,
    compose,
    preflight,
    verify_checksums,
)

RECREATE_SCHEMA_SQL = "DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;"


def _confirm(prompt: str) -> bool:
    answer = input(f"{prompt} [输入 yes 继续] ").strip().lower()
    return answer in {"yes", "y"}


def _run_psql(compose_file: Path, env_file: Path, db_name: str, db_user: str, sql: str) -> None:
    result = compose(
        ["exec", "-T", "postgres", "psql", "-v", "ON_ERROR_STOP=1", "-U", db_user, "-d", db_name, "-c", sql],
        compose_file=compose_file,
        env_file=env_file,
        stdout=subprocess.DEVNULL,
    )
    if result.returncode != 0:
        detail = (result.stderr or b"").decode("utf-8", "replace").strip()
        raise BackupError(f"重建 schema 失败：{detail or '未知错误'}")


def restore(backup_dir: Path, *, compose_file: Path, env_file: Path, assume_yes: bool) -> None:
    if not backup_dir.is_dir():
        raise BackupError(f"备份目录不存在：{backup_dir}")
    for name in ("db.dump", "media.tar.gz", "manifest.json"):
        if not (backup_dir / name).is_file():
            raise BackupError(f"备份不完整，缺少 {name}")

    problems = verify_checksums(backup_dir)
    if problems:
        raise BackupError("备份校验失败：" + "；".join(problems))

    manifest = json.loads((backup_dir / "manifest.json").read_text(encoding="utf-8"))
    info = preflight(compose_file, env_file)
    db_name = info["db_name"]
    db_user = info["db_user"]

    print(f"[restore] 备份时间：{manifest.get('created_at')}")
    print(f"[restore] 目标库：{db_name}@{db_user}（当前数据库内容会被覆盖）")
    print(f"[restore] 媒体文件：{manifest.get('media_files')} 个，alembic：{manifest.get('alembic_revision')}")
    if not assume_yes and not _confirm("[restore] 确认恢复？"):
        raise BackupError("已取消")

    print("[restore] 停止 api / web")
    stopped = compose(["stop", "web", "api"], compose_file=compose_file, env_file=env_file, stdout=subprocess.DEVNULL)
    if stopped.returncode != 0:
        # 服务本来就没起也算正常，继续
        print("[restore] 提示：stop 返回非零，若服务本来没运行可忽略")

    print("[restore] 重建 public schema")
    _run_psql(compose_file, env_file, db_name, db_user, RECREATE_SCHEMA_SQL)

    print("[restore] 导入数据库")
    with (backup_dir / "db.dump").open("rb") as handle:
        result = compose(
            [
                "exec",
                "-T",
                "postgres",
                "pg_restore",
                "--no-owner",
                "--no-privileges",
                "--exit-on-error",
                "-U",
                db_user,
                "-d",
                db_name,
            ],
            compose_file=compose_file,
            env_file=env_file,
            stdin=handle,
            stdout=subprocess.DEVNULL,
        )
    if result.returncode != 0:
        detail = (result.stderr or b"").decode("utf-8", "replace").strip()
        raise BackupError(f"数据库恢复失败：{detail or '未知错误'}")

    print("[restore] 解包媒体目录")
    with (backup_dir / "media.tar.gz").open("rb") as handle:
        result = compose(
            [
                "run",
                "--rm",
                "--no-deps",
                "-T",
                "--entrypoint",
                "tar",
                "api",
                "-xzf",
                "-",
                "-C",
                "/data",
            ],
            compose_file=compose_file,
            env_file=env_file,
            stdin=handle,
            stdout=subprocess.DEVNULL,
        )
    if result.returncode != 0:
        detail = (result.stderr or b"").decode("utf-8", "replace").strip()
        raise BackupError(f"媒体解包失败：{detail or '未知错误'}")

    print("[restore] 重新启动 api / web（入口会执行 alembic upgrade head）")
    result = compose(["up", "-d", "api", "web"], compose_file=compose_file, env_file=env_file, stdout=subprocess.DEVNULL)
    if result.returncode != 0:
        detail = (result.stderr or b"").decode("utf-8", "replace").strip()
        raise BackupError(f"启动服务失败：{detail or '未知错误'}")

    print("[restore] 完成。打开控制台确认数据；若后端报迁移冲突，检查 alembic heads")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="从备份目录恢复学习助手")
    parser.add_argument("backup_dir", type=Path, help="备份目录，例如 backups/learn-assistant-20261029-200000")
    parser.add_argument("--compose-file", type=Path, default=DEFAULT_COMPOSE_FILE)
    parser.add_argument("--env-file", type=Path, default=DEFAULT_ENV_FILE)
    parser.add_argument("--yes", action="store_true", help="跳过确认（谨慎使用）")
    args = parser.parse_args(argv)

    try:
        restore(args.backup_dir, compose_file=args.compose_file, env_file=args.env_file, assume_yes=args.yes)
    except BackupError as exc:
        print(f"[restore] {exc}", file=sys.stderr)
        return 1
    except KeyboardInterrupt:
        print("\n[restore] 已中断（数据库可能处于不完整状态，请重新执行恢复）", file=sys.stderr)
        return 130
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
