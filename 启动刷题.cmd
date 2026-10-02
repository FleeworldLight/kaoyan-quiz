@echo off
chcp 65001 >nul
cd /d "%~dp0"
title 考研刷题 · 本地服务

echo ============================================
echo   考研刷题（政治 / 英语一 / 数学一 / 408）
echo ============================================
echo.

if not exist "dist\index.html" (
  echo [1/2] 首次运行，正在构建前端...
  where pnpm >nul 2>nul
  if errorlevel 1 (
    echo 未检测到 pnpm，改用 npm...
    call npm install
    call npm run build
  ) else (
    call pnpm install --node-linker=hoisted
    call pnpm run build
  )
  if not exist "dist\index.html" (
    echo.
    echo 构建失败，请检查上面的错误信息。
    pause
    exit /b 1
  )
) else (
  echo [1/2] 已存在构建产物 dist\ ，跳过构建。
)

echo [2/2] 启动本地服务 http://127.0.0.1:5199/
echo       关闭这个窗口即可停止服务。
echo.
start "" http://127.0.0.1:5199/
node "tools\serve.mjs" 5199 dist
pause
