# Install (or remove) the gateway as a Windows startup task.
# Runs as SYSTEM at boot, with nobody logged in, and restarts every minute if it crashes.
#
#   powershell -ExecutionPolicy Bypass -File scripts\install-windows.ps1
#   powershell -ExecutionPolicy Bypass -File scripts\install-windows.ps1 -Uninstall
#
# Run from an Administrator PowerShell. Requires Node.js 24+ and a filled-in .env.

param(
  [switch]$Uninstall,
  [string]$TaskName = 'MPC ANPR Gateway'
)

$ErrorActionPreference = 'Stop'
$GatewayDir = Split-Path -Parent $PSScriptRoot

if ($Uninstall) {
  Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
  Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
  Write-Host "Removed '$TaskName'."
  exit 0
}

$node = (Get-Command node.exe -ErrorAction SilentlyContinue).Source
if (-not $node) { throw 'node.exe not found. Install Node.js 24 LTS first.' }
$major = [int]((& $node --version).TrimStart('v').Split('.')[0])
if ($major -lt 24) { throw "Node.js 24+ required (found $(& $node --version))." }
if (-not (Test-Path (Join-Path $GatewayDir '.env'))) { throw "Missing $GatewayDir\.env (copy env.example)." }

$action = New-ScheduledTaskAction -Execute $node -Argument 'src\main.ts run' -WorkingDirectory $GatewayDir
$trigger = New-ScheduledTaskTrigger -AtStartup
$settings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable `
  -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) `
  -ExecutionTimeLimit ([TimeSpan]::Zero) -MultipleInstances IgnoreNew
$principal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest

Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger `
  -Settings $settings -Principal $principal -Force | Out-Null
Start-ScheduledTask -TaskName $TaskName

Write-Host "Installed and started '$TaskName'."
Write-Host "Log: $GatewayDir\data\gateway.log"
