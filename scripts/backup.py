"""备份学习助手：数据库 dump + 三个媒体目录，落成带校验和与清单的目录。

面向 Docker 部署（`docker-compose.prod.yml`）。本地开发环境也可以用它，
只要本机有 docker compose 并且服务在跑；没有 Docker 的机器请按 README 里的
「非 Docker 环境」用 pg_dump + 拷目录。

用法：
    python scripts/backup.py                        # 备份到 ./backups/
    python scripts/backup.py --out D:/backups       # 指定目录
    python scripts/backup.py --keep 7               # 只保留最近 7 份（0 = 不清理）

产物（一个目录）：
    db.dump           pg_dump -Fc 的自定义格式，pg_restore 能直接吃
    media.tar.gz      /data 下的 exports / screenshots / note_images
    checksums.sha256  两个文件的 sha256，恢复前会校验
    manifest.json     时间、库名、alembic 版本、文件大小、媒体文件数

恢复用 scripts/restore.py（会先校验 checksums 再让输入确认）。
"""

from __future__ import annotations

import argparse
import hashlib
import json
import shutil
import subprocess
import sys
import tarfile
from datetime import UTC, datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DEFAULT_COMPOSE_FILE = ROOT / "docker-compose.prod.yml"
DEFAULT_ENV_FILE = ROOT / ".env.production"
DEFAULT_OUT_DIR = ROOT / "backups"

MEDIA_DIRS = ("exports", "screenshots", "note_images")
BACKUP_FILES = ("db.dump", "media.tar.gz")


class BackupError(RuntimeError):
    """可预期失败：打印一行说明后退出，不抛栈。"""


def parse_env_file(path: Path) -> dict[str, str]:
    """极简 .env 解析：支持 KEY=VALUE、引号、行尾注释与 export 前缀。

    与 app/core/config.py 里的解析保持一致的"够用"程度，不追求完整 shell 语法。
    """
    values: dict[str, str] = {}
    if not path.is_file():
        return values
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        line = line.removeprefix("export ")
        if "=" not in line:
            continue
        key, _, value = line.partition("=")
        value = value.strip()
        if value[:1] in {'"', "'"}:
            # 引号包起来的值里可以含 # 和空格，取到配对的引号为止
            quote = value[0]
            end = value.find(quote, 1)
            value = value[1:end] if end != -1 else value[1:]
        else:
            value = value.split(" #", 1)[0].rstrip()
        values[key.strip()] = value
    return values


def backup_dir_name(now: datetime | None = None) -> str:
    moment = now or datetime.now(UTC)
    return f"learn-assistant-{moment.strftime('%Y%m%d-%H%M%S')}"


def sha256_of(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def write_checksums(directory: Path, files: tuple[str, ...] = BACKUP_FILES) -> Path:
    lines = [f"{sha256_of(directory / name)}  {name}" for name in files if (directory / name).is_file()]
    target = directory / "checksums.sha256"
    target.write_text("\n".join(lines) + "\n", encoding="utf-8")
    return target


def verify_checksums(directory: Path) -> list[str]:
    """返回问题列表；空列表表示全部校验通过。"""
    checksum_file = directory / "checksums.sha256"
    if not checksum_file.is_file():
        return ["缺少 checksums.sha256，无法校验"]
    problems: list[str] = []
    for line in checksum_file.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line:
            continue
        expected, _, name = line.partition("  ")
        path = directory / name
        if not path.is_file():
            problems.append(f"缺少文件：{name}")
            continue
        actual = sha256_of(path)
        if actual != expected:
            problems.append(f"校验失败：{name}（期望 {expected[:12]}…，实际 {actual[:12]}…）")
    return problems


def _compose_argv(compose_file: Path, env_file: Path, args: list[str]) -> list[str]:
    argv = ["docker", "compose"]
    if env_file.is_file():
        argv += ["--env-file", str(env_file)]
    argv += ["-f", str(compose_file), *args]
    return argv


def compose(
    args: list[str],
    *,
    compose_file: Path,
    env_file: Path,
    stdout=None,
    stdin=None,
) -> subprocess.CompletedProcess:
    argv = _compose_argv(compose_file, env_file, args)
    try:
        return subprocess.run(argv, stdout=stdout, stdin=stdin, stderr=subprocess.PIPE, check=False)
    except FileNotFoundError as exc:  # docker 不在 PATH
        raise BackupError("找不到 docker 命令，请先安装 Docker Desktop 或 docker engine") from exc


def _require_ok(result: subprocess.CompletedProcess, what: str) -> None:
    if result.returncode != 0:
        detail = (result.stderr or b"").decode("utf-8", "replace").strip()
        raise BackupError(f"{what}失败：{detail or '未知错误'}")


def preflight(compose_file: Path, env_file: Path) -> dict[str, str]:
    if not compose_file.is_file():
        raise BackupError(f"找不到 compose 文件：{compose_file}")
    if not env_file.is_file():
        raise BackupError(f"找不到环境文件：{env_file}（从 .env.production.example 复制一份）")
    version = compose(["version"], compose_file=compose_file, env_file=env_file, stdout=subprocess.DEVNULL)
    _require_ok(version, "docker compose 自检")
    values = parse_env_file(env_file)
    db_name = values.get("POSTGRES_DB", "learn_assistant")
    db_user = values.get("POSTGRES_USER", "learn_assistant")
    running = compose(
        ["ps", "--status", "running", "--services"],
        compose_file=compose_file,
        env_file=env_file,
        stdout=subprocess.PIPE,
    )
    _require_ok(running, "检查服务状态")
    services = running.stdout.decode("utf-8", "replace").split()
    if "postgres" not in services:
        raise BackupError("postgres 服务没在运行，先 docker compose ... up -d")
    return {"db_name": db_name, "db_user": db_user, "services": services}


def _read_alembic_revision(compose_file: Path, env_file: Path) -> str | None:
    result = compose(
        ["run", "--rm", "--no-deps", "-T", "api", "alembic", "current"],
        compose_file=compose_file,
        env_file=env_file,
        stdout=subprocess.PIPE,
    )
    if result.returncode != 0:
        return None
    text = result.stdout.decode("utf-8", "replace")
    for line in text.splitlines():
        if "head" in line:
            return line.split("(head)")[0].strip() or None
    return None


def dump_database(target: Path, compose_file: Path, env_file: Path, db_name: str, db_user: str) -> int:
    """pg_dump 直接写文件；返回字节数。"""
    with (target / "db.dump").open("wb") as handle:
        result = compose(
            ["exec", "-T", "postgres", "pg_dump", "-U", db_user, "-d", db_name, "-Fc"],
            compose_file=compose_file,
            env_file=env_file,
            stdout=handle,
        )
    _require_ok(result, "数据库导出")
    return (target / "db.dump").stat().st_size


def dump_media(target: Path, compose_file: Path, env_file: Path) -> int:
    """用一次性容器打包 /data，不依赖 api 是否在跑。"""
    with (target / "media.tar.gz").open("wb") as handle:
        result = compose(
            [
                "run",
                "--rm",
                "--no-deps",
                "-T",
                "--entrypoint",
                "tar",
                "api",
                "-czf",
                "-",
                "-C",
                "/data",
                *MEDIA_DIRS,
            ],
            compose_file=compose_file,
            env_file=env_file,
            stdout=handle,
        )
    _require_ok(result, "媒体目录打包")
    return (target / "media.tar.gz").stat().st_size


def count_media_files(archive: Path) -> int:
    try:
        with tarfile.open(archive, "r:gz") as tar:
            return sum(1 for member in tar.getmembers() if member.isfile())
    except (tarfile.TarError, OSError):
        return 0


def build_manifest(
    *,
    created_at: datetime,
    db_name: str,
    db_bytes: int,
    media_bytes: int,
    media_files: int,
    alembic_revision: str | None,
) -> dict:
    return {
        "created_at": created_at.isoformat(),
        "database": db_name,
        "db_bytes": db_bytes,
        "media_bytes": media_bytes,
        "media_files": media_files,
        "alembic_revision": alembic_revision,
        "files": list(BACKUP_FILES),
    }


def prune_old_backups(out_dir: Path, keep: int) -> list[Path]:
    """只按名字里的时间戳排序，删掉最旧的；keep<=0 表示不清理。"""
    if keep <= 0 or not out_dir.is_dir():
        return []
    candidates = sorted(
        (path for path in out_dir.iterdir() if path.is_dir() and path.name.startswith("learn-assistant-")),
        key=lambda path: path.name,
    )
    stale = candidates[:-keep] if len(candidates) > keep else []
    removed: list[Path] = []
    for path in stale:
        shutil.rmtree(path, ignore_errors=True)
        removed.append(path)
    return removed


def run_backup(*, out_dir: Path, compose_file: Path, env_file: Path, keep: int, now: datetime | None = None) -> Path:
    created_at = now or datetime.now(UTC)
    info = preflight(compose_file, env_file)
    out_dir.mkdir(parents=True, exist_ok=True)
    target = out_dir / backup_dir_name(created_at)
    if target.exists():
        raise BackupError(f"备份目录已存在：{target}")
    target.mkdir(parents=True)

    try:
        db_bytes = dump_database(target, compose_file, env_file, info["db_name"], info["db_user"])
        media_bytes = dump_media(target, compose_file, env_file)
        revision = _read_alembic_revision(compose_file, env_file)
        write_checksums(target)
        manifest = build_manifest(
            created_at=created_at,
            db_name=info["db_name"],
            db_bytes=db_bytes,
            media_bytes=media_bytes,
            media_files=count_media_files(target / "media.tar.gz"),
            alembic_revision=revision,
        )
        (target / "manifest.json").write_text(
            json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
        )
    except Exception:
        # 半成品目录容易误导恢复流程，直接清掉
        shutil.rmtree(target, ignore_errors=True)
        raise

    prune_old_backups(out_dir, keep)
    return target


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="备份学习助手（数据库 + 媒体目录）")
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT_DIR, help="备份根目录，默认 ./backups")
    parser.add_argument("--compose-file", type=Path, default=DEFAULT_COMPOSE_FILE)
    parser.add_argument("--env-file", type=Path, default=DEFAULT_ENV_FILE)
    parser.add_argument("--keep", type=int, default=0, help="只保留最近 N 份（0 = 不清理）")
    args = parser.parse_args(argv)

    try:
        target = run_backup(
            out_dir=args.out,
            compose_file=args.compose_file,
            env_file=args.env_file,
            keep=args.keep,
        )
    except BackupError as exc:
        print(f"[backup] {exc}", file=sys.stderr)
        return 1
    manifest = json.loads((target / "manifest.json").read_text(encoding="utf-8"))
    print(f"[backup] 完成：{target}")
    print(
        f"[backup] 数据库 {manifest['db_bytes'] / 1024 / 1024:.2f} MB，"
        f"媒体 {manifest['media_files']} 个文件 / {manifest['media_bytes'] / 1024 / 1024:.2f} MB，"
        f"alembic {manifest['alembic_revision'] or '未知'}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
