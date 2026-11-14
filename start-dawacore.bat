@echo off
cd /d "%~dp0"
chcp 65001 > nul
title DawaCore Local Server

set "PATH=C:\Program Files\nodejs;%PATH%"
for /d %%d in ("C:\Program Files\PostgreSQL\*") do (
    if exist "%%d\bin\psql.exe" set "PATH=%%d\bin;%PATH%"
)
for /d %%d in ("C:\PostgreSQL\*") do (
    if exist "%%d\bin\psql.exe" set "PATH=%%d\bin;%PATH%"
)

echo ========================================================
echo        DawaCore - Pharmacy and Inventory System
echo ========================================================
echo.

if not exist "%~dp0.env" (
    echo [NOTICE] First-time setup required. Launching configuration wizard...
    powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\configure-install.ps1"
    if errorlevel 1 (
        echo [ERROR] Configuration did not complete.
        pause
        exit /b 1
    )
)

echo [1/3] Checking production readiness...
call node tools\preflight-offline.cjs
if errorlevel 1 (
    echo [ERROR] Setup is incomplete. Check configuration and PostgreSQL.
    pause
    exit /b 1
)
echo [2/3] Starting DawaCore...
start "DawaCore Server" /min cmd /c "set PATH=C:\Program Files\nodejs;%PATH%&& set HOST=0.0.0.0&& set PORT=3002&& node dist/main.js"
echo [3/3] Waiting for the service...
timeout /t 4 /nobreak > nul
echo.
echo ========================================================
echo  DawaCore started successfully.
echo  Open on this computer: http://localhost:3002
echo  On other POS devices, open: http://SERVER-IP:3002
echo ========================================================
echo.
start http://localhost:3002/login
