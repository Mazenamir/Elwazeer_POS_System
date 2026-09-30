@echo off
setlocal
cd /d "%~dp0"

echo [INFO] Checking PostgreSQL server status...
"%~dp0postgresql\bin\pg_ctl.exe" status -D "%~dp0programs\data" >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    echo [OK] PostgreSQL is already running on port 5432.
    goto :done
)

echo [INFO] Starting local PostgreSQL from: %~dp0programs\data
"%~dp0postgresql\bin\pg_ctl.exe" start -D "%~dp0programs\data" -l "%~dp0programs\data\pg_server.log"
if %ERRORLEVEL% EQU 0 (
    echo [OK] PostgreSQL server started successfully!
) else (
    echo [WARN] Could not start PostgreSQL with pg_ctl or it is already active.
)

:done
endlocal
