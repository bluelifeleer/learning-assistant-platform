param(
    [ValidateSet("postgresql", "mysql", "all")]
    [string]$Database = "postgresql"
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

$composeArgs = @("compose", "--profile", $Database, "up", "-d")
if ($Database -eq "postgresql") {
    $composeArgs += "postgres"
} elseif ($Database -eq "mysql") {
    $composeArgs += "mysql"
}

docker @composeArgs

Write-Host ""
Write-Host "Database container started." -ForegroundColor Green
if ($Database -eq "postgresql" -or $Database -eq "all") {
    Write-Host "PostgreSQL: host=127.0.0.1 port=5432 database=learn_assistant username=learn_assistant password=learn_assistant"
}
if ($Database -eq "mysql" -or $Database -eq "all") {
    Write-Host "MySQL:      host=127.0.0.1 port=3306 database=learn_assistant username=learn_assistant password=learn_assistant"
}
Write-Host "Open the console installer and use these values, or keep the defaults for PostgreSQL."
