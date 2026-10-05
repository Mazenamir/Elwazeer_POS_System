@echo off
setlocal
cd /d "%~dp0"
title Bebyoon POS System - وضع التطوير (Dev Mode)

echo ========================================================
echo        نظام بيبيون / الوزير - بيئة التطوير المباشر
echo        Live React 19 + Vite HMR + Electron Desktop
echo ========================================================
echo.

call npm run dev

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [ERROR] Development server exited with code %ERRORLEVEL%.
    pause
)

endlocal
