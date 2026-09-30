@echo off
chcp 65001 >nul
echo [INFO] جاري إيقاف خادم PostgreSQL بأمان...
"%~dp0postgresql\bin\pg_ctl.exe" stop -D "%~dp0programs\data" -m fast
echo [OK] تم إيقاف PostgreSQL بنجاح.
