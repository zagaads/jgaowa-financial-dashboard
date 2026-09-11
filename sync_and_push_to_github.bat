@echo off
title JGAOWA - Sync Excel & Push to GitHub Pages
echo ====================================================================
echo   JGAOWA Financial Dashboard - Sync Excel & Push to GitHub Pages
echo ====================================================================
echo.
echo [1/3] Extracting latest data from Excel files...
py excel_extractor.py
echo.
echo [2/3] Staging and committing changes...
git add .
git commit -m "Update financial data from Excel"
echo.
echo [3/3] Pushing to GitHub Pages...
git push origin main
echo.
echo ====================================================================
echo  SYNC COMPLETE!
echo  Your live dashboard will update in ~30 seconds at:
echo  https://zagaads.github.io/jgaowa-financial-dashboard/
echo ====================================================================
echo.
pause
