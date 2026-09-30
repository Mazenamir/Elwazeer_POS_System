@echo off
chcp 65001 >nul
title Bebyoon POS System - تشغيل النظام الجديد
echo ========================================================
echo        نظام بيبيون / الوزير لإدارة نقاط البيع والتجزئة
echo                 النسخة المعمارية المطورة
echo ========================================================
echo.

call "%~dp0start_postgres.bat"

echo.
echo [INFO] جاري تشغيل تطبيق سطح المكتب (Electron)...
cd /d "%~dp0"
npm start
