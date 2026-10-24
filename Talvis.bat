@echo off
title PhD Analyzer - Talvis
cd /d "%~dp0"
if not exist node_modules (
  echo Paketler qurulur...
  call npm install
)
echo Talvis basladilir: http://localhost:5179
start "" cmd /c "timeout /t 12 >nul & start http://localhost:5179"
call npm start
