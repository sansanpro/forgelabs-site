@echo off
rem Keeps the render workers running on a Windows PC: each restarts 10 seconds after any exit.
rem Started at boot by the ForgeWorker scheduled task (install.ps1). Expects the repo at
rem C:\forge\forgelabs-site, the virtualenv at C:\forge\venv and the keys in the repo's .env.local.
rem Runs FORGE_WORKERS workers side by side, 3 unless that's set in the system environment.
rem Each records one voice at a time, and ElevenLabs Starter takes 3 at once: with 6 on Starter,
rem voices waited out their retries and one pack failed (docs/PLAN.md, "Render capacity"). Raise it
rem with the plan (Creator 5, Pro 10); this PC's CPU is worth up to 8.
rem studio_claim_job's skip-locked claim keeps them off each other's jobs.
rem Worker 1 logs to worker.log, worker 2 to worker-2.log and so on, in FORGE_HOME (C:\forge
rem unless set). Each log rolls over to .old.log at 10 MB.
cd /d "%~dp0..\.."
if "%FORGE_HOME%"=="" set FORGE_HOME=C:\forge
set id=%~1
if not "%id%"=="" goto start
if "%FORGE_WORKERS%"=="" set FORGE_WORKERS=3
for /l %%i in (2,1,%FORGE_WORKERS%) do start "" /b cmd /c ""%~f0" %%i"
set id=1
:start
set log=%FORGE_HOME%\worker-%id%.log
if "%id%"=="1" set log=%FORGE_HOME%\worker.log
:loop
if exist "%log%" for %%F in ("%log%") do if %%~zF GTR 10000000 move /y "%log%" "%log:.log=.old.log%" >nul
echo [%date% %time%] starting worker %id% >> "%log%"
"%FORGE_HOME%\venv\Scripts\python.exe" -u worker.py >> "%log%" 2>&1
rem `timeout` needs a console, which a scheduled task doesn't have; ping waits instead
ping -n 11 127.0.0.1 >nul
goto loop
