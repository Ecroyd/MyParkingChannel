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
 * At start-up, at sign-in, and every 5 minutes. The repeat is what keeps it running: Windows'
 * Fast Startup skips "at start-up" triggers, waking from sleep fires none, and an update or crash
 * ends the process. MultipleInstances IgnoreNew makes the repeat a no-op while it is running.
 */
const TRIGGERS_PS = [
  '$triggers = @(',
  '  (New-ScheduledTaskTrigger -AtStartup),',
  '  (New-ScheduledTaskTrigger -AtLogOn),',
  '  (New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 5))',
  ')',
  '$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero) -MultipleInstances IgnoreNew',
];

/**
 * Bring a task registered by an older version up to date (it had only the start-up trigger).
 * Run by the gateway itself as SYSTEM; Set-ScheduledTask leaves the running instance alone.
 */
export function buildTaskRefreshScript(): string {
  return ["$ErrorActionPreference = 'Stop'", ...TRIGGERS_PS, `Set-ScheduledTask -TaskName ${psQuote(TASK_NAME)} -Trigger $triggers -Settings $settings | Out-Null`].join('\r\n') + '\r\n';
}

/** Run a PowerShell script in this process's own account (no elevation prompt). */
export function runPowerShell(script: string): Promise<void> {
  const file = join(tmpdir(), `mpc-gateway-${process.pid}-${Date.now()}.ps1`);
  writeFileSync(file, script, 'utf8');
  return new Promise((resolve, reject) => {
    const child = spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', file], { windowsHide: true, stdio: 'ignore' });
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`PowerShell exited with ${code}`))));
    child.on('error', reject);
  });
}

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
      // Installing over a running background gateway (an upgrade): stop it so its exe can be replaced.
      `Stop-ScheduledTask -TaskName ${psQuote(TASK_NAME)} -ErrorAction SilentlyContinue`,
      'if ((Resolve-Path $src).Path -ne $exe) {',
      '  for ($i = 0; ; $i++) {',
      '    try { Copy-Item -Force -Path $src -Destination $exe; break }',
      '    catch { if ($i -ge 20) { throw }; Start-Sleep -Milliseconds 500 }',
      '  }',
      '}'
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
    ...TRIGGERS_PS,
    "$principal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest",
    `Register-ScheduledTask -TaskName ${psQuote(TASK_NAME)} -Action $action -Trigger $triggers -Settings $settings -Principal $principal -Force | Out-Null`,
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
