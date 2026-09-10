@echo off
title JGAOWA Desktop Financial Display Board
cd /d "%~dp0"
echo ========================================================
echo Starting JGAOWA Desktop Live Financial Display Board...
echo ========================================================
py server.py
if %ERRORLEVEL% NEQ 0 (
    python server.py
)
pause
