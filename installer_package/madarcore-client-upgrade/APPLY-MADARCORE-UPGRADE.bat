@echo off
setlocal EnableExtensions EnableDelayedExpansion
title MadarCore Client Upgrade Launcher (20261116)

echo ================================================================================
echo   MadarCore Client Upgrade Launcher - منصة مدار كور لإدارة الأعمال
echo   Release: MadarCore-Client-Upgrade-20261116
echo ================================================================================
echo.

:: 1. Check Administrator Privileges
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo [ERROR] This upgrade requires Administrator privileges.
    echo [ERROR] Please right-click APPLY-MADARCORE-UPGRADE.bat and select "Run as administrator".
    echo [ERROR] يتطلب تشغيل هذا التحديث صلاحيات المسؤول (Run as administrator).
    echo.
    pause
    exit /b 1
)

:: 2. Resolve script directory
set "SCRIPT_DIR=%~dp0"
if "%SCRIPT_DIR:~-1%"=="\" set "SCRIPT_DIR=%SCRIPT_DIR:~0,-1%"

:: 3. Execute PowerShell Orchestrator
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "& '%SCRIPT_DIR%\apply-madarcore-upgrade.ps1' %*"
set "EXIT_CODE=%errorLevel%"

echo.
if %EXIT_CODE% equ 0 (
    echo [SUCCESS] Upgrade finished successfully.
) else (
    echo [ERROR] Upgrade terminated with exit code %EXIT_CODE%.
)

pause
exit /b %EXIT_CODE%
