<#
.SYNOPSIS
  恢复入口（Windows）：逻辑在 restore.py，这里只找 Python 并转交。

.EXAMPLE
  .\scripts\restore.ps1 backups\learn-assistant-20261029-200000
  .\scripts\restore.ps1 backups\learn-assistant-20261029-200000 -Yes
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true, Position = 0)]
  [string]$BackupDir,
  [switch]$Yes,
  [string]$ComposeFile,
  [string]$EnvFile
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot

$python = Join-Path $root "apps\api\.venv\Scripts\python.exe"
if (-not (Test-Path $python)) {
  $command = Get-Command python -ErrorAction SilentlyContinue
  if ($null -eq $command) {
    Write-Error "需要 Python 3.11+：没找到 apps\api\.venv 也没有 python 在 PATH 里"
    exit 1
  }
  $python = $command.Source
}

$arguments = @((Join-Path $root "scripts\restore.py"), $BackupDir)
if ($Yes) { $arguments += "--yes" }
if ($ComposeFile) { $arguments += @("--compose-file", $ComposeFile) }
if ($EnvFile) { $arguments += @("--env-file", $EnvFile) }

& $python @arguments
exit $LASTEXITCODE
