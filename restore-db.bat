@echo off
chcp 65001 > nul
title DawaCore - استعادة قاعدة البيانات
cd /d "%~dp0"
if "%~1"=="" (
    echo الاستخدام: restore-db.bat C:\DawaCore_Backups\dawacore_YYYY-MM-DD.sql
    pause
    exit /b 1
)
echo تحذير: الاستعادة تستبدل البيانات الحالية في قاعدة البيانات.
choice /C YN /M "هل تريد المتابعة"
if errorlevel 2 exit /b 0
node tools\restore-db.cjs "%~1" --confirm
if errorlevel 1 (
    echo [خطأ] فشلت الاستعادة.
    pause
    exit /b 1
)
pause
