@echo off
setlocal
cd /d "%~dp0"

echo [INFO] Checking PostgreSQL server status...
"%~dp0postgresql\bin\pg_ctl.exe" status -D "%~dp0programs\data" >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    echo [OK] PostgreSQL is already running on port 5432.
    goto :done
)

REM Remove stale postmaster.pid if postgres is not actually running
if exist "%~dp0programs\data\postmaster.pid" (
    echo [WARN] Found stale postmaster.pid - removing it...
    del /f "%~dp0programs\data\postmaster.pid"
)

echo [INFO] Starting local PostgreSQL from: %~dp0programs\data
"%~dp0postgresql\bin\pg_ctl.exe" start -D "%~dp0programs\data" -l "%~dp0programs\data\log\pg_latest.log" -w -t 60
if %ERRORLEVEL% EQU 0 (
    echo [OK] PostgreSQL server started successfully!
) else (
    echo [WARN] pg_ctl returned non-zero. Checking if server is actually up...
    netstat -an | findstr ":5432 " >nul 2>&1
    if %ERRORLEVEL% EQU 0 (
        echo [OK] PostgreSQL is listening on port 5432.
    ) else (
        echo [ERROR] PostgreSQL failed to start. Check: %~dp0programs\data\log
    )
)

:done
endlocal
