@echo off
setlocal

cd /d "%~dp0"

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
"$url = 'http://localhost:3000/admin.html'; ^
try { ^
    $response = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 2; ^
    if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 400) { exit 0 } else { exit 1 } ^
} catch { exit 1 }"

if errorlevel 1 (
    echo Demarrage du serveur Admin Beats...
    start "Admin Beats Server" cmd /k "cd /d "%~dp0" && npm start"
    timeout /t 3 /nobreak >nul
)

start "" "http://localhost:3000/admin.html"

endlocal