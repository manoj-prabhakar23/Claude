@echo off
REM Double-click (or use the desktop shortcut) to start Home Cinema on Windows.
title Home Cinema server - keep this window open while watching
cd /d "%~dp0"
where node >nul 2>nul || (echo Node.js is not installed. Run setup-windows.bat first. & pause & exit /b 1)
node server\server.js --open
pause
