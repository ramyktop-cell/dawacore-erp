@echo off
cd /d "%~dp0"
chcp 65001 > nul
title DawaCore - Reset All Items and Transactions

set "PATH=C:\Program Files\nodejs;%PATH%"

echo ========================================================
echo  WARNING: This will delete all medicines, batches,
echo  sales, purchases, shifts, expenses, and journal entries
echo  while keeping Users, Branches, and Chart of Accounts.
echo ========================================================
echo.
set /p CONFIRM="Type YES to confirm wiping all items and transactions: "
if /i not "%CONFIRM%"=="YES" (
    echo Operation cancelled.
    pause
    exit /b 0
)

node tools\reset-clean.cjs
echo.
pause
