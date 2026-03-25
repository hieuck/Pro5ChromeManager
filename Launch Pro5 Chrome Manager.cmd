@echo off
setlocal
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js 18+ chua duoc cai dat hoac chua nam trong PATH.
  echo Cai Node.js roi mo lai file nay.
  echo.
  pause
  exit /b 1
)

node "scripts\launch-desktop.js"
if errorlevel 1 (
  echo.
  echo Khoi chay Pro5 Chrome Manager that bai.
  pause
  exit /b 1
)

endlocal
