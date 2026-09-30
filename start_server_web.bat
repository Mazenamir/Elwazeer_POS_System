@echo off
chcp 65001 >nul
title Bebyoon POS Web Server - خادم الويب المستقل
echo ========================================================
echo        تشغيل خادم الويب المستقل - بيبيون / الوزير
echo                 النسخة المعمارية المطورة
echo ========================================================
echo.

call "%~dp0start_postgres.bat"

echo.
echo [INFO] جاري تشغيل خادم Express...
cd /d "%~dp0"
npm run server
