@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"
title 逐浪竞速 - 局域网服务
where node >nul 2>nul
if errorlevel 1 (
 echo 首次使用请先安装 Node.js 20 或更高版本：
 echo https://nodejs.org/
 echo 安装完成后重新双击本文件。
 pause
 exit /b 1
)
node -e "if(Number(process.versions.node.split('.')[0])<20)process.exit(1)"
if errorlevel 1 (
 echo Node.js 版本过旧，请安装 20 或更高版本后重试。
 pause
 exit /b 1
)
if not exist "node_modules\ws\package.json" (
 echo 服务包不完整：缺少附带的依赖。请完整解压后再启动。
 pause
 exit /b 1
)
echo 正在启动局域网服务，请保持此窗口打开。
node scripts\racing-server.mjs --open %*
if errorlevel 1 (
 echo 服务启动失败，请根据上方提示处理后重试。
 pause
)
