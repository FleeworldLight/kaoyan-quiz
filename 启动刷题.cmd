@echo off
rem ===========================================================================
rem  kaoyan-quiz launcher  (one-click start)
rem
rem  IMPORTANT: keep this file PURE ASCII.
rem  cmd.exe reads .bat/.cmd using the system OEM codepage (GBK on zh-CN).
rem  If you put UTF-8 Chinese here and also run "chcp 65001", cmd's byte offset
rem  into the file gets out of sync and it resumes in the MIDDLE of lines,
rem  producing errors like:  '??? ' is not recognized as an internal command.
rem  All Chinese output and logic live in tools/launch.mjs instead.
rem ===========================================================================

setlocal
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 goto nonode

for /f "tokens=1 delims=." %%v in ('node -p "process.versions.node"') do set NODE_MAJOR=%%v
if %NODE_MAJOR% LSS 18 goto oldnode

title kaoyan-quiz local server
node "tools\launch.mjs" %*
echo.
pause
exit /b 0

:nonode
echo.
echo   [ERROR] Node.js was not found in PATH.
echo   Install Node.js 18+ from https://nodejs.org/ then run this file again.
echo.
pause
exit /b 1

:oldnode
echo.
echo   [ERROR] Node.js 18+ is required, but version %NODE_MAJOR% was found.
echo   Please upgrade from https://nodejs.org/ then run this file again.
echo.
pause
exit /b 1
