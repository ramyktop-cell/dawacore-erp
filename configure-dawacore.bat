@echo off
chcp 65001 > nul
title DawaCore Configuration
cd /d "%~dp0"
echo ========================================================
echo              DawaCore Configuration
echo ========================================================
echo.
"%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\configure-install.ps1"
if errorlevel 1 (
  echo.
  echo [ERROR] Configuration did not complete.
  echo Keep this window open and record the error shown above.
  pause
  exit /b 1
)