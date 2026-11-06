@echo off
chcp 65001 >nul
echo ========================================================
echo   تحديث شامل لنظام بيبيون (السيرفر المركزي + الفرع)
echo ========================================================
echo.

:: Check for administrative permissions
net session >nul 2>&1
if %errorLevel% == 0 (
    echo تم تأكيد صلاحيات الأدمن (Administrator).
) else (
    echo يتطلب صلاحيات الأدمن، جاري طلب الإذن...
    powershell -Command "Start-Process cmd -ArgumentList '/c \"\"%~f0\"\"' -Verb RunAs"
    exit /b
)

echo إغلاق البرنامج إن كان يعمل...
taskkill /F /IM "Bebyoon Branch System.exe" >nul 2>&1
taskkill /F /IM "Bebyoon System.exe" >nul 2>&1
timeout /t 2 >nul

set "SRC_SERVER=D:\WORK\new_elwazeer\src\server"
set "SRC_SHARED=D:\WORK\new_elwazeer\src\shared"
set "SRC_DIST=D:\WORK\new_elwazeer\dist\renderer"

:: Patch Branch System
if exist "C:\Program Files\Bebyoon Branch System\resources" (
    echo [1/2] جاري تحديث نسخة الفرع (Bebyoon Branch System)...
    xcopy /s /e /y /i "%SRC_SERVER%\*" "C:\Program Files\Bebyoon Branch System\resources\server\" >nul
    xcopy /s /e /y /i "%SRC_SHARED%\*" "C:\Program Files\Bebyoon Branch System\resources\shared\" >nul
    xcopy /s /e /y /i "%SRC_DIST%\*" "C:\Program Files\Bebyoon Branch System\resources\dist\renderer\" >nul
    echo  [✓] تم تحديث السيرفر والواجهة لنسخة الفرع بنجاح!
)

:: Patch Master System
if exist "C:\Program Files\Bebyoon System\resources" (
    echo [2/2] جاري تحديث نسخة السيرفر الرئيسي (Bebyoon System)...
    xcopy /s /e /y /i "%SRC_SERVER%\*" "C:\Program Files\Bebyoon System\resources\server\" >nul
    xcopy /s /e /y /i "%SRC_SHARED%\*" "C:\Program Files\Bebyoon System\resources\shared\" >nul
    xcopy /s /e /y /i "%SRC_DIST%\*" "C:\Program Files\Bebyoon System\resources\dist\renderer\" >nul
    echo  [✓] تم تحديث السيرفر والواجهة لنسخة السيرفر الرئيسي بنجاح!
)

echo.
echo ========================================================
echo  تم تحديث جميع الملفات وإصلاح التقارير والمزامنة بنجاح!
echo  يمكنك الآن تشغيل البرنامج.
echo ========================================================
echo.
pause
