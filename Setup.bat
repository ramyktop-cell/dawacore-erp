@echo off
chcp 65001 > nul
title DawaCore - Installation and Configuration Wizard

net session >nul 2>&1
if %errorLevel% neq 0 (
    echo ========================================================
    echo  [NOTICE]: Administrator privileges are required.
    echo  Elevating to Administrator automatically...
    echo ========================================================
    powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "Start-Process -FilePath '%~f0' -Verb RunAs -Wait"
    exit /b %errorLevel%
)

set "APP_DIR=%~dp0"
if "%APP_DIR:~-1%"=="\" set "APP_DIR=%APP_DIR:~0,-1%"
cd /d "%APP_DIR%"

cls
echo ========================================================
echo       DawaCore - Pharmacy POS and ERP Setup Wizard
echo ========================================================
echo.

set "PATH=C:\Program Files\nodejs;%PATH%"
for /d %%d in ("C:\Program Files\PostgreSQL\*") do (
    if exist "%%d\bin\psql.exe" set "PATH=%%d\bin;%PATH%"
)
for /d %%d in ("C:\PostgreSQL\*") do (
    if exist "%%d\bin\psql.exe" set "PATH=%%d\bin;%PATH%"
)

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%APP_DIR%\tools\configure-install.ps1"
if %errorLevel% neq 0 (
    echo.
    echo ========================================================
    echo  [ERROR]: Setup encountered an error. See details above.
    echo ========================================================
    pause
    exit /b 1
)

echo.
echo ========================================================
echo  Starting DawaCore Server and opening browser...
echo ========================================================
call "%APP_DIR%\start-dawacore-server.bat"
exit /b 0
