@echo off
title Personal Wealth & Financial Terminal
cd /d "%~dp0"
echo ========================================================
echo Starting Personal Wealth & Financial Terminal...
echo ========================================================
cd personal_finance
py server.py
if %ERRORLEVEL% NEQ 0 (
    python server.py
)
pause
