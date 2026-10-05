@echo off
setlocal
cd /d "%~dp0"

echo [INFO] Checking PostgreSQL server status...
set PGPASSWORD=ahmed1@
"%~dp0postgresql\bin\psql.exe" -h 127.0.0.1 -p 5432 -U postgres -d pos_db -c "SELECT 1;" >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    echo [OK] PostgreSQL is active and accepting connections on port 5432.
    goto :done
)

echo [WARN] PostgreSQL is not responding. Cleaning up stale instances...
taskkill /F /IM postgres.exe >nul 2>&1
if exist "%~dp0programs\data\postmaster.pid" (
    del /f "%~dp0programs\data\postmaster.pid" >nul 2>&1
)

echo [INFO] Starting local PostgreSQL from: %~dp0programs\data
"%~dp0postgresql\bin\pg_ctl.exe" start -D "%~dp0programs\data" -w -t 20
if %ERRORLEVEL% EQU 0 (
    echo [OK] PostgreSQL server started successfully!
) else (
    echo [WARN] Retrying PostgreSQL start...
    "%~dp0postgresql\bin\pg_ctl.exe" start -D "%~dp0programs\data"
)

REM Final verification
set PGPASSWORD=ahmed1@
"%~dp0postgresql\bin\psql.exe" -h 127.0.0.1 -p 5432 -U postgres -d pos_db -c "SELECT 1;" >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    echo [OK] PostgreSQL is confirmed ready and accepting connections!
) else (
    echo [ERROR] PostgreSQL failed to respond. Check: %~dp0programs\data\log
)

:done
endlocal
