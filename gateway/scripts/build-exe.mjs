// Build the gateway into one self-contained executable (Node single executable application).
//
//   node scripts/build-exe.mjs            → dist/mpc-gateway.exe on Windows, dist/mpc-gateway elsewhere
//
// Embeds the Node binary running this script, so build with the Node version you want to ship
// (24 LTS). The release workflow runs it on Windows; on macOS it produces a local test build.

import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, rmSync, writeFileSync, chmodSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ESBUILD = 'esbuild@0.27.0';
const POSTJECT = 'postject@1.0.0-alpha.6';
const FUSE = 'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
const isWin = process.platform === 'win32';
const isMac = process.platform === 'darwin';
const out = join(dist, isWin ? 'mpc-gateway.exe' : 'mpc-gateway');
const npx = isWin ? 'npx.cmd' : 'npx';

const run = (cmd, args) => {
  console.log(`> ${cmd} ${args.join(' ')}`);
  execFileSync(cmd, args, { stdio: 'inherit', cwd: root, shell: isWin });
};

rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });

// 1) One CommonJS file. Node built-ins (incl. node:sqlite) stay external; there are no npm deps.
run(npx, [
  '--yes',
  ESBUILD,
  'src/main.ts',
  '--bundle',
  '--platform=node',
  '--format=cjs',
  '--target=node24',
  `--outfile=${join(dist, 'gateway.cjs')}`,
  // main.ts only reads import.meta.url when not packaged.
  '--log-override:empty-import-meta=silent',
]);

// 2) The blob Node injects into its own binary.
writeFileSync(
  join(dist, 'sea-config.json'),
  JSON.stringify({ main: join(dist, 'gateway.cjs'), output: join(dist, 'sea-prep.blob'), disableExperimentalSEAWarning: true }, null, 2)
);
run(process.execPath, ['--experimental-sea-config', join(dist, 'sea-config.json')]);

// 3) Copy this Node binary and inject the blob.
copyFileSync(process.execPath, out);
chmodSync(out, 0o755);
if (isMac) run('codesign', ['--remove-signature', out]);
run(npx, [
  '--yes',
  POSTJECT,
  out,
  'NODE_SEA_BLOB',
  join(dist, 'sea-prep.blob'),
  '--sentinel-fuse',
  FUSE,
  ...(isMac ? ['--macho-segment-name', 'NODE_SEA'] : []),
]);
if (isMac) run('codesign', ['--sign', '-', out]);

console.log(`\nBuilt ${out}`);
