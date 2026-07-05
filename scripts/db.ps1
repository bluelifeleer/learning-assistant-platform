$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
Set-Location "$Root\apps\api"
.\.venv\Scripts\python -m alembic upgrade head
