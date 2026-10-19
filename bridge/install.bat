@echo off
chcp 65001 >nul
set "DEST=%LOCALAPPDATA%\SyDent Bridge"
if not exist "%DEST%" mkdir "%DEST%"
copy /Y "%~dp0SyDentBridge.exe" "%DEST%\SyDentBridge.exe" >nul
schtasks /Create /F /TN SyDentBridge /SC ONLOGON /RL LIMITED /TR "\"%DEST%\SyDentBridge.exe\"" >nul
start "" "%DEST%\SyDentBridge.exe"
echo SyDent Bridge installed. A browser page opens for pairing (http://127.0.0.1:4816).
pause
