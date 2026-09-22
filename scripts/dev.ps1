$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot

# 单窗口模式:API 和控制台以后台作业运行,日志加前缀合并输出到当前窗口
$api = Start-Job -Name "lap-api" -ScriptBlock {
    param($ApiDir)
    Set-Location $ApiDir
    & .\.venv\Scripts\python -m uvicorn app.main:app --host 127.0.0.1 --port 17890 2>&1
} -ArgumentList "$Root\apps\api"

$console = Start-Job -Name "lap-console" -ScriptBlock {
    param($RootDir)
    Set-Location $RootDir
    & pnpm --filter @learn-assistant/console dev 2>&1
} -ArgumentList $Root

Write-Host "API:      http://127.0.0.1:17890" -ForegroundColor Cyan
Write-Host "Console:  http://127.0.0.1:17891" -ForegroundColor Cyan
Write-Host "按 Ctrl+C 停止全部服务" -ForegroundColor DarkGray

Start-Process "http://127.0.0.1:17891"

try {
    while ($true) {
        Receive-Job $api -ErrorAction SilentlyContinue | ForEach-Object { Write-Host "[api] $_" }
        Receive-Job $console -ErrorAction SilentlyContinue | ForEach-Object { Write-Host "[console] $_" }
        if ($api.State -ne "Running" -and $console.State -ne "Running") { break }
        Start-Sleep -Milliseconds 500
    }
} finally {
    Stop-Job $api, $console -ErrorAction SilentlyContinue
    Remove-Job $api, $console -Force -ErrorAction SilentlyContinue
}
