@echo off
chcp 65001 >nul
title DawaCore ERP & POS - Offline Local Server
cd /d "%~dp0\.."

echo ======================================================================
echo 🚀 جاري تشغيل خادم DawaCore ERP و نقاط البيع (الوضع المحلي أوفلاين)
echo ======================================================================
echo.

if not exist "frontend\dist\index.html" (
    echo [1/3] جاري بناء واجهة المستخدم للإنتاج لأول مرة...
    cd frontend
    call npm run build
    cd ..
)

if not exist "dist\main.js" (
    echo [2/3] جاري بناء الخادم الخلفي لأول مرة...
    call npm run build
)

echo.
echo 🌐 عناوين الشبكة المحلية (LAN IP) لربط نقاط البيع الـ 4 بالخادم:
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /c:"IPv4"') do (
    echo    👉 http://%%a:3002
)
echo    👉 http://localhost:3002 (من نفس جهاز السيرفر)
echo ======================================================================
echo.

set PORT=3002
node dist/main.js
pause
