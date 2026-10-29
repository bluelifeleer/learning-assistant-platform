#!/usr/bin/env bash
# 备份入口（macOS / Linux）：真正的逻辑在 backup.py
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if command -v python3 >/dev/null 2>&1; then
  PYTHON=python3
elif command -v python >/dev/null 2>&1; then
  PYTHON=python
else
  echo "需要 Python 3.11+：先安装 python3" >&2
  exit 1
fi

exec "$PYTHON" "$ROOT/scripts/backup.py" "$@"
