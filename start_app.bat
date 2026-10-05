@echo off
setlocal
cd /d "%~dp0"
title Bebyoon POS System - تشغيل النظام الجديد

echo ========================================================
echo        نظام بيبيون / الوزير لإدارة نقاط البيع والتجزئة
echo                 النسخة المعمارية المطورة
echo ========================================================
echo.

call "%~dp0start_postgres.bat"

echo.
echo [INFO] Starting Bebyoon Desktop Application (Electron)...
call npm start

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [ERROR] Application exited with code %ERRORLEVEL%.
    pause
)

endlocal
