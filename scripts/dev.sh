#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
API_DIR="$ROOT/apps/api"
API_PORT="${API_PORT:-17890}"
CONSOLE_PORT="${CONSOLE_PORT:-17891}"
API_URL="http://127.0.0.1:${API_PORT}"
CONSOLE_URL="http://127.0.0.1:${CONSOLE_PORT}"

if [[ -x "$API_DIR/.venv/bin/python" ]]; then
  PYTHON="$API_DIR/.venv/bin/python"
elif command -v python3 >/dev/null 2>&1; then
  PYTHON="python3"
else
  PYTHON="python"
fi

if ! command -v pnpm >/dev/null 2>&1; then
  echo "pnpm is required. Install it first, then run pnpm install." >&2
  exit 1
fi

cleanup() {
  if [[ -n "${API_PID:-}" ]]; then kill "$API_PID" 2>/dev/null || true; fi
  if [[ -n "${CONSOLE_PID:-}" ]]; then kill "$CONSOLE_PID" 2>/dev/null || true; fi
}
trap cleanup EXIT INT TERM

cd "$API_DIR"
"$PYTHON" -m uvicorn app.main:app --host 127.0.0.1 --port "$API_PORT" &
API_PID=$!

cd "$ROOT"
pnpm --filter @learn-assistant/console dev -- --host 127.0.0.1 --port "$CONSOLE_PORT" &
CONSOLE_PID=$!

sleep 2
if command -v open >/dev/null 2>&1; then
  open "$CONSOLE_URL" >/dev/null 2>&1 || true
elif command -v xdg-open >/dev/null 2>&1; then
  xdg-open "$CONSOLE_URL" >/dev/null 2>&1 || true
fi

echo "Learning Assistant is starting."
echo "API:     $API_URL"
echo "Console: $CONSOLE_URL"
echo "Press Ctrl+C to stop both services."

wait
