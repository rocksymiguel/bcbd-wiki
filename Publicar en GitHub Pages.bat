@echo off
setlocal
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Publicar en GitHub Pages.ps1" %*
set "exitCode=%ERRORLEVEL%"
echo.
pause
exit /b %exitCode%
