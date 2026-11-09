@echo off
rem Keeps the render worker running on a Windows PC: restarts it 10 seconds after any exit.
rem Started at boot by the ForgeWorker scheduled task (install.ps1). Expects the repo at
rem C:\forge\forgelabs-site, the virtualenv at C:\forge\venv and the keys in the repo's .env.local.
rem Logs go to C:\forge\worker.log, which rolls over to worker.old.log at 10 MB.
cd /d "%~dp0..\.."
:loop
for %%F in (C:\forge\worker.log) do if %%~zF GTR 10000000 move /y C:\forge\worker.log C:\forge\worker.old.log >nul
echo [%date% %time%] starting the worker >> C:\forge\worker.log
"C:\forge\venv\Scripts\python.exe" -u worker.py >> C:\forge\worker.log 2>&1
rem `timeout` needs a console, which a scheduled task doesn't have; ping waits instead
ping -n 11 127.0.0.1 >nul
goto loop
