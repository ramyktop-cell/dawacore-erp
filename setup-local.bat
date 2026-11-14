@echo off
chcp 65001 > nul
title DawaCore - التثبيت والتهيئة الأولية

echo ========================================================
echo        DawaCore - إعداد النظام على الجهاز المحلي
echo ========================================================
echo.

echo [1/5] فحص حزم الخادم الخلفي (Offline)...
if not exist "node_modules\@nestjs\core" (
    echo [خطأ] حزم الخادم غير موجودة في حزمة التسليم.
    echo يجب تجهيز الحزمة على جهاز متصل قبل نقلها Offline.
    pause
    exit /b 1
)

echo.
echo [2/5] توليد مكتبة Prisma Client...
call npx prisma generate
if errorlevel 1 exit /b 1

echo.
echo [3/5] تطبيق مخطط قاعدة البيانات (Database Migrations)...
call npx prisma migrate deploy
if errorlevel 1 exit /b 1

echo.
echo [4/5] التحقق من ملفات التشغيل المجمعة...
if not exist "dist\main.js" (
    echo [خطأ] dist\main.js غير موجودة في حزمة التسليم.
    exit /b 1
)
if not exist "frontend\dist\index.html" (
    echo [خطأ] frontend\dist غير موجودة في حزمة التسليم.
    exit /b 1
)

echo.
echo [5/5] تهيئة حساب المدير الأول...
echo Demo seed is disabled. Use tools/bootstrap-admin.cjs to create the first administrator.

echo.
echo ========================================================
echo   اكتمل التثبيت والتهيئة بنجاح!
echo   يمكنك الآن النقر المزدوج على "start-dawacore.bat" لتشغيل النظام.
echo ========================================================
echo.
pause
