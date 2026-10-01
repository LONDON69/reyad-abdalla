@echo off
title HomeHub Launcher
echo ==============================================
echo        Starting HomeHub Pro Server...
echo ==============================================

:: Check if Node.js is installed
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo.
    echo [ERROR] Node.js is not installed or not in your PATH!
    echo Please download and install Node.js from: https://nodejs.org
    echo Make sure to check "Add to PATH" during installation.
    echo.
    pause
    exit /b
)

:: Navigate to the folder containing this batch script
cd /d "%~dp0"

:: Install dependencies if node_modules is missing
if not exist "node_modules\" (
    echo Installing required project dependencies...
    call npm install
)

:: Open browser automatically after 2 seconds in the background
start "" cmd /c "timeout /t 2 >nul & start http://localhost:3001"

:: Start the server
echo Starting server on http://localhost:3001 ...
node server.js
pause