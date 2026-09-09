@echo off
for /f "usebackq tokens=*" %%i in (`powershell -NoProfile -Command "(Get-Content panorama.config.json | ConvertFrom-Json).cs2Exe"`) do set "CS2_EXE=%%i"
if not exist "%CS2_EXE%" (echo Configure cs2Exe in panorama.config.json & exit /b 1)
start "CS2 Panorama Dev" "%CS2_EXE%" -insecure -windowed -dev -panorama
