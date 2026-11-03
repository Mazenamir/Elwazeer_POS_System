@echo off
chcp 65001 >nul
echo ========================================================
echo جاري تحديث ملف rentals.service.js في مجلد البرنامج المثبت
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
taskkill /F /IM "Bebyoon System.exe" >nul 2>&1

copy /Y "D:\WORK\new_elwazeer\src\server\modules\rentals\rentals.service.js" "C:\Program Files\Bebyoon System\resources\server\modules\rentals\rentals.service.js"

if %errorLevel% == 0 (
    echo.
    echo ========================================================
    echo  تم نسخ الملف بنجاح إلى Program Files!
    echo  يمكنك الآن فتح برنامج Bebyoon System والبدل ستظهر فوراً.
    echo ========================================================
) else (
    echo.
    echo [خطأ] تعذر نسخ الملف. يرجى التأكد من إغلاق البرنامج وإعادة المحاولة كمسؤول.
)

pause
