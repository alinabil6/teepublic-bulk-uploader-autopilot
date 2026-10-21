@echo off
title Magic Fabrica - TeePublic Studio
color 0b
echo ========================================================
echo    MAGIC FABRICA - TEEPUBLIC BULK UPLOADER STUDIO
echo ========================================================
echo.

:: 1. Check if py launcher works
py -c "import sys" >nul 2>nul
if %errorlevel% equ 0 (
    set PY_CMD=py
    goto :found_python
)

:: 2. Check if real python works (excluding Windows Store stub)
python -c "import sys" >nul 2>nul
if %errorlevel% equ 0 (
    set PY_CMD=python
    goto :found_python
)

:: Python is missing or intercepted by WindowsApps stub!
color 0c
echo ========================================================
echo   [!] PYTHON IS NOT INSTALLED ON THIS PC YET
echo ========================================================
echo.
echo Windows detected the Microsoft Store shortcut, but the
echo actual Python software is not installed yet on your PC.
echo.
echo Choose an option below to install Python in 1 minute:
echo.
echo   [1] Auto-install Python via Windows (Winget) - Fastest
echo   [2] Download Official Python Installer from python.org
echo   [3] Open Python 3.12 on Microsoft Store
echo.
set /p choice="Type 1, 2, or 3 and press Enter (or press Enter for 1): "

if "%choice%"=="2" (
    start https://www.python.org/ftp/python/3.12.7/python-3.12.7-amd64.exe
    echo.
    echo Download started in your browser.
    echo IMPORTANT: In the installer, check: [x] "Add python.exe to PATH"
    echo Once installed, double-click START_STUDIO.bat again!
    pause
    exit /b 1
)

if "%choice%"=="3" (
    start ms-windows-store://pdp/?productid=9NCVDN91XZQP
    echo.
    echo Opened Microsoft Store. Click "Get" to install Python,
    echo then double-click START_STUDIO.bat again!
    pause
    exit /b 1
)

:: Default to Option 1: winget
echo.
echo [Installing Python 3.12 via Windows Package Manager...]
echo Please wait, this takes about 30-60 seconds...
winget install Python.Python.3.12 --source winget --accept-package-agreements --accept-source-agreements
if %errorlevel% equ 0 (
    echo.
    echo ========================================================
    echo  Python installed successfully!
    echo  Please close this window and double-click
    echo  START_STUDIO.bat again to start the Studio!
    echo ========================================================
) else (
    echo.
    echo Winget was not able to install automatically.
    echo Opening official installer in your browser...
    start https://www.python.org/ftp/python/3.12.7/python-3.12.7-amd64.exe
    echo IMPORTANT: In the installer, check: [x] "Add python.exe to PATH"
)
pause
exit /b 1

:found_python
color 0b
echo [1/3] Functional Python detected: %PY_CMD%
echo [2/3] Checking and installing required packages...
%PY_CMD% -m pip install -r requirements.txt --disable-pip-version-check
if %errorlevel% neq 0 (
    echo [WARNING] Package check had an issue, attempting to proceed...
)

echo.
echo [3/3] Starting Magic Fabrica Studio on http://127.0.0.1:5050 ...
echo Browser will open automatically in a moment.
echo.
echo ========================================================
echo  Studio is LIVE! Keep this terminal open while working.
echo ========================================================
echo.

%PY_CMD% main.py
pause
