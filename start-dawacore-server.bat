@echo off
setlocal EnableExtensions DisableDelayedExpansion
cd /d "%~dp0"
chcp 65001 > nul
title DawaCore Server

set "NODE_EXE="
if exist "%~dp0Runtime\node\node.exe" set "NODE_EXE=%~dp0Runtime\node\node.exe"
if not defined NODE_EXE if exist "%~dp0Runtime\nodejs\node.exe" set "NODE_EXE=%~dp0Runtime\nodejs\node.exe"
if not defined NODE_EXE if exist "C:\DawaCore\Runtime\node\node.exe" set "NODE_EXE=C:\DawaCore\Runtime\node\node.exe"
if not defined NODE_EXE if exist "C:\DawaCore\Runtime\nodejs\node.exe" set "NODE_EXE=C:\DawaCore\Runtime\nodejs\node.exe"
if not defined NODE_EXE if exist "C:\Program Files\nodejs\node.exe" set "NODE_EXE=C:\Program Files\nodejs\node.exe"
if not defined NODE_EXE for /f "delims=" %%n in ('where node.exe 2^>nul') do if not defined NODE_EXE set "NODE_EXE=%%n"

if not defined NODE_EXE (
    echo [ERROR] Node.js was not found in DawaCore Runtime or Program Files.
    pause
    exit /b 1
)

echo ========================================================
echo        DawaCore - Central Pharmacy Server
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

set "APP_PORT=3002"
for /f "tokens=1,* delims==" %%a in ('findstr /b /i "PORT=" "%~dp0.env" 2^>nul') do set "APP_PORT=%%b"
set "APP_PORT=%APP_PORT:"=%"
set "HOST=0.0.0.0"
set "PORT=%APP_PORT%"
echo [1/2] Checking server readiness...
"%NODE_EXE%" tools\preflight-offline.cjs
if errorlevel 1 (
    echo [ERROR] Readiness check failed. Check .env and ensure PostgreSQL service is running.
    pause
    exit /b 1
)
echo [2/2] Starting DawaCore on port %APP_PORT%...
start "DawaCore Server" /min "%NODE_EXE%" dist\main.js
timeout /t 4 /nobreak > nul
echo.
echo On this computer: http://localhost:%APP_PORT%
echo On POS tablets/PCs: http://SERVER-IP:%APP_PORT%
echo.
start http://localhost:%APP_PORT%/login
