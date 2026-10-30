// "Run in the background" on Windows: copy the gateway into ProgramData, lock that folder down to
// SYSTEM and Administrators (it holds the NVR password and device key), register a startup task
// that runs as SYSTEM, and hand over to it. Needs one UAC prompt.

import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, win32 } from 'node:path';

export const TASK_NAME = 'MPC ANPR Gateway';

export function defaultWindowsDataDir(): string {
  return win32.join(process.env.ProgramData || 'C:\\ProgramData', 'MPC Gateway');
}

const psQuote = (s: string) => `'${s.replace(/'/g, "''")}'`;

/**
 * PowerShell run elevated. `launch` is the program plus its arguments up to (not including) the
 * gateway's own options, e.g. the packaged exe, or node.exe + main.ts in development.
 */
export function buildInstallScript(opts: {
  installDir: string;
  dataDir: string;
  launch: string[];
  packagedExe: string | null;
  waitForPid: number;
  port: number;
}): string {
  const { installDir, dataDir, packagedExe } = opts;
  const lines = [
    "$ErrorActionPreference = 'Stop'",
    `$dir = ${psQuote(installDir)}`,
    'New-Item -ItemType Directory -Force -Path $dir | Out-Null',
  ];

  let exe: string;
  let args: string[];
  if (packagedExe) {
    const target = win32.join(installDir, 'mpc-gateway.exe');
    lines.push(
      `$src = ${psQuote(packagedExe)}`,
      `$exe = ${psQuote(target)}`,
      'if ((Resolve-Path $src).Path -ne $exe) { Copy-Item -Force -Path $src -Destination $exe }'
    );
    exe = target;
    args = [];
  } else {
    exe = opts.launch[0];
    args = opts.launch.slice(1);
  }

  const taskArgs = [...args.map((a) => `"${a}"`), 'run', '--service', '--data', `"${dataDir}"`, '--port', String(opts.port)].join(' ');
  lines.push(
    // SYSTEM (S-1-5-18) and Administrators (S-1-5-32-544) only, by SID so it works in any language.
    `icacls ${psQuote(dataDir)} /inheritance:r /grant:r '*S-1-5-18:(OI)(CI)F' '*S-1-5-32-544:(OI)(CI)F' | Out-Null`,
    `$action = New-ScheduledTaskAction -Execute ${psQuote(exe)} -Argument ${psQuote(taskArgs)} -WorkingDirectory $dir`,
    '$trigger = New-ScheduledTaskTrigger -AtStartup',
    '$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero) -MultipleInstances IgnoreNew',
    "$principal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest",
    `Register-ScheduledTask -TaskName ${psQuote(TASK_NAME)} -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Force | Out-Null`,
    // Let the set-up window release the port before the service starts.
    `Wait-Process -Id ${opts.waitForPid} -Timeout 60 -ErrorAction SilentlyContinue`,
    `Start-ScheduledTask -TaskName ${psQuote(TASK_NAME)}`
  );
  return lines.join('\r\n') + '\r\n';
}

/**
 * Write the script and launch it elevated. Resolves once Windows has accepted the UAC prompt
 * (the script then waits for this process to exit); rejects if permission was declined.
 */
export async function launchElevatedInstall(script: string): Promise<void> {
  const file = join(tmpdir(), `mpc-gateway-install-${process.pid}.ps1`);
  writeFileSync(file, script, 'utf8');
  const inner = `-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "${file}"`;
  const command = `try { Start-Process -FilePath powershell.exe -Verb RunAs -WindowStyle Hidden -ArgumentList ${psQuote(inner)}; exit 0 } catch { exit 1 }`;

  const code = await new Promise<number>((resolve) => {
    const child = spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', command], {
      windowsHide: true,
      stdio: 'ignore',
    });
    child.on('exit', (c) => resolve(c ?? 1));
    child.on('error', () => resolve(1));
  });
  if (code !== 0) throw new Error('Windows permission was declined, so the gateway was not installed.');
}
