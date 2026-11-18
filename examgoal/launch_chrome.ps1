$chromePaths = @(
    "C:\Program Files\Google\Chrome\Application\chrome.exe",
    "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
    "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe"
)

$chrome = $chromePaths | Where-Object { Test-Path $_ } | Select-Object -First 1

if (-not $chrome) {
    Write-Error "Google Chrome executable was not found."
    exit 1
}

$profileDir = "$env:LOCALAPPDATA\Google\Chrome\AutomationProfile"

Write-Host "========================================================" -ForegroundColor Cyan
Write-Host " Launching Chrome with Remote Debugging for ExamGoal" -ForegroundColor Green
Write-Host " Port: 9222" -ForegroundColor Yellow
Write-Host " Profile: $profileDir" -ForegroundColor Yellow
Write-Host "========================================================" -ForegroundColor Cyan
Write-Host "Log in to ExamGoal in the opened Chrome window if needed." -ForegroundColor White
Write-Host "Keep this window open so MCP can fetch questions." -ForegroundColor White

Start-Process -FilePath $chrome -ArgumentList @(
    "--remote-debugging-port=9222",
    "--user-data-dir=`"$profileDir`"",
    "https://room.examgoal.com"
)
