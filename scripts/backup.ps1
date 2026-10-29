<#
.SYNOPSIS
  备份入口（Windows）：逻辑在 backup.py，这里只找 Python 并转交。

.EXAMPLE
  .\scripts\backup.ps1
  .\scripts\backup.ps1 -Out D:\backups -Keep 7
#>
[CmdletBinding()]
param(
  [string]$Out,
  [int]$Keep = 0,
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

$arguments = @((Join-Path $root "scripts\backup.py"))
if ($Out) { $arguments += @("--out", $Out) }
if ($Keep -gt 0) { $arguments += @("--keep", "$Keep") }
if ($ComposeFile) { $arguments += @("--compose-file", $ComposeFile) }
if ($EnvFile) { $arguments += @("--env-file", $EnvFile) }

& $python @arguments
exit $LASTEXITCODE
