# Sets up the render worker on a Windows PC as the ForgeWorker scheduled task: it starts at boot
# as SYSTEM, whether or not anyone is signed in, and run-worker.cmd restarts it if it exits.
# Run in an administrator PowerShell after cloning the repo to C:\forge\forgelabs-site:
#
#   C:\Python314\python.exe -m venv C:\forge\venv
#   C:\forge\venv\Scripts\python.exe -m pip install -r C:\forge\forgelabs-site\engine\requirements.txt
#   (put SUPABASE_SERVICE_ROLE_KEY and ELEVENLABS_API_KEY in C:\forge\forgelabs-site\.env.local)
#   powershell -ExecutionPolicy Bypass -File C:\forge\forgelabs-site\engine\deploy\windows\install.ps1
#
# After engine changes: git pull, then `schtasks /end /tn ForgeWorker` and `schtasks /run /tn ForgeWorker`.
$cmd = Join-Path $PSScriptRoot 'run-worker.cmd'
$action = New-ScheduledTaskAction -Execute 'cmd.exe' -Argument "/c `"$cmd`""
$trigger = New-ScheduledTaskTrigger -AtStartup
$settings = New-ScheduledTaskSettingsSet -ExecutionTimeLimit ([TimeSpan]::Zero) -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -MultipleInstances IgnoreNew
Register-ScheduledTask -TaskName ForgeWorker -Action $action -Trigger $trigger -Settings $settings `
  -User SYSTEM -RunLevel Highest -Force | Out-Null
Start-ScheduledTask -TaskName ForgeWorker
Get-ScheduledTask -TaskName ForgeWorker | Select-Object TaskName, State
