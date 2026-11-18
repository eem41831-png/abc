@echo off
set CHROME_PATH=C:\Program Files\Google\Chrome\Application\chrome.exe
if not exist "%CHROME_PATH%" (
    set CHROME_PATH=C:\Program Files (x86)\Google\Chrome\Application\chrome.exe
)
if not exist "%CHROME_PATH%" (
    set CHROME_PATH=%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe
)

if not exist "%CHROME_PATH%" (
    echo [ERROR] Google Chrome not found at standard locations.
    pause
    exit /b 1
)

set PROFILE_DIR=%LOCALAPPDATA%\Google\Chrome\AutomationProfile

echo ========================================================
echo  Launching Chrome with Remote Debugging for ExamGoal
echo  Port: 9222
echo  Profile: %PROFILE_DIR%
echo ========================================================
echo.
echo Please log in to ExamGoal in this Chrome window if you aren't already.
echo Keep this window open while fetching questions.
echo.

start "" "%CHROME_PATH%" --remote-debugging-port=9222 --user-data-dir="%PROFILE_DIR%" https://room.examgoal.com
