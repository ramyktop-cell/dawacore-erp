@echo off
chcp 65001 > nul
title DawaCore - النسخ الاحتياطي لقاعدة البيانات
cd /d "%~dp0"
node tools\backup-db.cjs
if errorlevel 1 (
    echo [خطأ] تعذر إنشاء النسخة. تأكد من تشغيل PostgreSQL ووجود pg_dump في PATH.
    pause
    exit /b 1
)
pause
