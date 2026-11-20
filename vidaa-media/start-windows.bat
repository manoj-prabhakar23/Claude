@echo off
REM Double-click to start the Home Cinema server on Windows.
cd /d "%~dp0"
where node >nul 2>nul || (echo Node.js is not installed. Get it from https://nodejs.org & pause & exit /b 1)
if not exist config.json copy config.example.json config.json >nul
node server\server.js
pause
