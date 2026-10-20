@echo off
REM Windows entry point: double-click or run from any shell.
REM dev.ps1 is unsigned; if the current terminal enforces AllSigned it fails with
REM "not digitally signed". Bypass applies to this child process only.
setlocal
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0dev.ps1" %*
