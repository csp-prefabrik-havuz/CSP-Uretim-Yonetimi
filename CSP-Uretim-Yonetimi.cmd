@echo off
setlocal EnableExtensions
set "APP_DIR=%~dp0"
set "NODE_EXE=%APP_DIR%runtime\node.exe"
if not exist "%NODE_EXE%" (
  for /f "delims=" %%N in ('where node 2^>nul') do (
    set "NODE_EXE=%%N"
    goto :node_ready
  )
)
:node_ready
if not exist "%NODE_EXE%" (
  echo.
  echo CSP Uretim Yonetimi acilamadi.
  echo Program klasorundeki runtime\node.exe dosyasi bulunamadi.
  echo Lutfen program klasorunu eksiksiz kopyalayin.
  echo.
  pause
  exit /b 1
)
for /f "tokens=5" %%P in ('netstat -ano ^| findstr /R /C:":8787 .*LISTENING"') do (
  for /f "tokens=1" %%N in ('tasklist /FI "PID eq %%P" /NH') do if /I "%%N"=="node.exe" taskkill /PID %%P /F >nul 2>&1
)
timeout /t 1 /nobreak >nul
powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -Command "Start-Process -FilePath '%NODE_EXE%' -ArgumentList '\"%APP_DIR%server.js\"' -WindowStyle Hidden"
timeout /t 1 /nobreak >nul
start "" "http://127.0.0.1:8787"
