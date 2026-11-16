@echo off
rem HERESY 2649 (the native Windows port): Ruach Studio on Windows, no WSL. The first start installs (launcher\install.ps1: uv, Python 3.12,
rem the Studio's packages, the models a song needs), every start runs the lab and the engine, each in its own window, and opens the Studio.
rem ASCII only on purpose: cmd reads a .cmd in the console's code page (866 or 1251 on a Russian Windows), never in UTF-8.
setlocal
cd /d "%~dp0"
set PYTHONUTF8=1
set PYTHONUNBUFFERED=1
if not exist ".venv\Scripts\python.exe" (
  powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0launcher\install.ps1" %*
  if errorlevel 1 (
    echo.
    echo Ruach Studio: the install stopped. The lines above say why; start RuachStudio.cmd again to go on where it stopped.
    pause
    exit /b 1
  )
)
powershell -NoProfile -Command "try { Invoke-WebRequest http://127.0.0.1:41870/health -UseBasicParsing -TimeoutSec 2 | Out-Null; exit 0 } catch { exit 1 }"
if errorlevel 1 start "Ruach Studio - lab" /min "%~dp0.venv\Scripts\python.exe" "%~dp0lab\lab.py"
powershell -NoProfile -Command "try { Invoke-WebRequest http://127.0.0.1:7777/hardware -UseBasicParsing -TimeoutSec 2 | Out-Null; exit 0 } catch { exit 1 }"
if errorlevel 1 start "Ruach Studio - engine" "%~dp0.venv\Scripts\python.exe" "%~dp0launcher\start.py"
echo Waiting for the Studio on http://127.0.0.1:7777 ...
powershell -NoProfile -Command "$t = 0; while ($t -lt 300) { try { Invoke-WebRequest http://127.0.0.1:7777/hardware -UseBasicParsing -TimeoutSec 2 | Out-Null; Start-Process 'http://127.0.0.1:7777'; exit 0 } catch { Start-Sleep 2; $t += 2 } }; Write-Host 'The Studio did not answer in 5 minutes: its window says why.'; exit 1"
endlocal
