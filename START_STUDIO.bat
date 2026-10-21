@echo off
title Magic Fabrica - TeePublic Studio
color 0b
echo ========================================================
echo    MAGIC FABRICA - TEEPUBLIC BULK UPLOADER STUDIO
echo ========================================================
echo.

:: Detect Python command (py or python)
where py >nul 2>nul
if %errorlevel% equ 0 (
    set PY_CMD=py
    goto :found_python
)

where python >nul 2>nul
if %errorlevel% equ 0 (
    set PY_CMD=python
    goto :found_python
)

echo [ERROR] Python is not installed or not found in PATH!
echo.
echo Please install Python 3.10+ from:
echo https://www.python.org/downloads/
echo.
echo IMPORTANT: During installation, check the box:
echo "Add python.exe to PATH"
echo.
pause
exit /b 1

:found_python
echo [1/3] Python detected: %PY_CMD%
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
