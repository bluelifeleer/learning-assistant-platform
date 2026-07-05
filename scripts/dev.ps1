$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot

Start-Process powershell -ArgumentList "-NoExit", "-Command", "Set-Location '$Root\apps\api'; .\.venv\Scripts\python -m uvicorn app.main:app --host 127.0.0.1 --port 17890"
Start-Process powershell -ArgumentList "-NoExit", "-Command", "Set-Location '$Root'; pnpm --filter @learn-assistant/console dev"
Start-Process "http://127.0.0.1:17891"
