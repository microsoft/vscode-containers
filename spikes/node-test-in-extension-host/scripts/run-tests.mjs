// Launcher: downloads/reuses a VS Code build and runs the in-host node:test
// runner, with raw V8 coverage collected via NODE_V8_COVERAGE.
//
// NODE_V8_COVERAGE is the entire coverage mechanism -- there is no
// instrumentation step. @vscode/test-cli does exactly the same thing and then
// hands the output to c8. scripts/cov-report.js shows the c8 step is optional.
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import crypto from 'node:crypto';

const here = path.dirname(fileURLToPath(import.meta.url));
const extensionDevelopmentPath = path.resolve(here, '..');
const repoRoot = path.resolve(here, '../../..');

// @vscode/test-electron is not hoisted to the workspace root under pnpm, so
// look for it where it actually lives before falling back to normal resolution.
function resolveTestElectron() {
  const candidates = [
    path.join(repoRoot, 'extensions/vscode-containers/node_modules'),
    path.join(repoRoot, 'node_modules'),
    here,
  ];
  for (const base of candidates) {
    try {
      return createRequire(path.join(base, 'noop.js'))('@vscode/test-electron');
    } catch {
      /* try next */
    }
  }
  throw new Error('Could not resolve @vscode/test-electron from any known location.');
}

const { runTests } = resolveTestElectron();

const coverageDir = path.join(os.tmpdir(), `spike-nt-cov-${crypto.randomUUID()}`);
fs.mkdirSync(coverageDir, { recursive: true });

// Keep the user-data dir short: on macOS/Linux a deep checkout can overflow the
// 104-char AF_UNIX sun_path limit.
const userDataDir = path.join(os.tmpdir(), `spike-nt-ud-${crypto.randomUUID().slice(0, 8)}`);

let exitCode = 0;
try {
  await runTests({
    extensionDevelopmentPath,
    extensionTestsPath: path.resolve(here, '../runner'),
    extensionTestsEnv: { NODE_V8_COVERAGE: coverageDir },
    launchArgs: [
      '--disable-extensions',
      '--disable-gpu',
      '--user-data-dir', userDataDir,
    ],
  });
  console.log('\nTEST RUN PASSED');
} catch (err) {
  exitCode = 1;
  console.error(`\nTEST RUN FAILED: ${err?.message ?? err}`);
}

const rawFiles = fs.existsSync(coverageDir)
  ? fs.readdirSync(coverageDir).filter((f) => f.endsWith('.json'))
  : [];
console.log(`[coverage] raw V8 files: ${rawFiles.length}`);
console.log(`[coverage] dir: ${coverageDir}`);

if (rawFiles.length > 0) {
  const { report } = await import('./cov-report.js');
  report(coverageDir);
}

process.exit(exitCode);
