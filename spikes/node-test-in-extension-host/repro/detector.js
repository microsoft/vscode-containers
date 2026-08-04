// Validates the completion detector used by ../runner/index.js, in plain Node
// (no Electron) so the loop is ~1s instead of ~5 minutes.
//
//   node detector.js                        -> runs all three cases
//   node detector.js multi-a.test.js ...    -> runs one specific set
//
// Expected:
//   all passing  -> root=2/2 failures=0  exit 0
//   with failure -> root=4/4 failures=1  exit 1   (1, not 2 -- suites re-emit)
//   single file  -> root=1/1 failures=0  exit 0
const path = require('path');
const { spawnSync } = require('child_process');
const { run } = require('node:test');
const { spec } = require('node:test/reporters');

const CASES = [
  ['all passing ', ['multi-b.test.js', 'esm-tla.test.mjs'], 0],
  ['with failure', ['multi-a.test.js', 'multi-b.test.js', 'esm-tla.test.mjs'], 1],
  ['single file ', ['sample.test.js'], 0],
];

function child(names) {
  const files = names.map((f) => path.resolve(__dirname, f));
  const stream = run({ files, isolation: 'none', concurrency: false, timeout: 20000 });

  let rootEnqueued = 0;
  let rootCompleted = 0;
  let failures = 0;
  let settle;
  const finished = new Promise((r) => { settle = r; });
  const checkDone = () => {
    if (rootEnqueued > 0 && rootCompleted >= rootEnqueued) setImmediate(settle);
  };

  stream.on('test:enqueue', (e) => { if (e.nesting === 0) rootEnqueued++; });
  stream.on('test:complete', (e) => { if (e.nesting === 0) { rootCompleted++; checkDone(); } });
  stream.on('test:fail', (e) => { if (!(e.details && e.details.type === 'suite')) failures++; });
  stream.compose(spec).pipe(process.stdout);

  const hardStop = setTimeout(() => {
    console.log('RESULT !!! DETECTOR FAILED TO SETTLE');
    process.exit(99);
  }, 15000);

  finished.then(() => {
    clearTimeout(hardStop);
    console.log(`RESULT root=${rootCompleted}/${rootEnqueued} failures=${failures}`);
    process.exit(failures > 0 ? 1 : 0);
  });
}

if (process.argv.length > 2) {
  child(process.argv.slice(2));
} else {
  let bad = 0;
  for (const [label, files, wantExit] of CASES) {
    const r = spawnSync(process.execPath, [__filename, ...files], { encoding: 'utf8' });
    const line = (r.stdout || '').split('\n').find((l) => l.startsWith('RESULT'));
    const ok = r.status === wantExit && line && !line.includes('!!!');
    if (!ok) bad++;
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}  exit=${r.status} (want ${wantExit})  ${line ?? ''}`);
  }
  process.exit(bad === 0 ? 0 : 1);
}
