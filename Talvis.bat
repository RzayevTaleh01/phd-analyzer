@echo off
title PhD Analyzer - Talvis
cd /d "%~dp0"
if not exist node_modules (
  echo Installing packages...
  call npm install
)
echo Starting PhD Analyzer: http://localhost:5179
start "" cmd /c "timeout /t 12 >nul & start http://localhost:5179"
call npm start
