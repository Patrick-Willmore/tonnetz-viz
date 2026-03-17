@echo off
echo Starting TonnetzViz servers...
echo   Original:   http://localhost:8083
echo   TonnetzMic: http://localhost:8084
echo.
echo Press Ctrl+C to stop both servers.
echo.
start "" /B python -m http.server 8083 --bind localhost --directory "%~dp0."
start "" /B python -m http.server 8084 --bind localhost --directory "%~dp0tonnetzmic"
pause >nul
