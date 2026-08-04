// In-host runner using node:test instead of Mocha.
//
// isolation:'none' runs tests in THIS process, so the `vscode` module and the
// extension host context stay available. That mode is mandatory here.
//
// WORKAROUND (https://github.com/nodejs/node/issues/60020, open):
// under isolation:'none' the stream returned by run() never emits 'end' (nor
// 'test:summary', nor a root-level 'test:plan'), so awaiting it hangs forever.
// Every other event is emitted correctly, and run() enqueues all root-level
// items before executing any of them -- verified for CJS and for ESM with
// top-level await. So completion is detected by counting root-level
// enqueue/complete events instead. See ../repro for the isolation of this bug.
const path = require('path');
const fs = require('fs');
const { run } = require('node:test');
const { spec } = require('node:test/reporters');

function findTests(dir, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) findTests(p, acc);
    else if (e.name.endsWith('.test.js')) acc.push(p);
  }
  return acc;
}

async function runTests() {
  const testsRoot = path.resolve(__dirname, '../src/test');
  const files = findTests(testsRoot);
  console.log('[runner] node:test files:', files.length);

  const stream = run({
    files,
    isolation: 'none',
    concurrency: false,
    timeout: 20000,
  });

  let rootEnqueued = 0;
  let rootCompleted = 0;
  let failures = 0;
  let settle;
  const finished = new Promise((resolve) => { settle = resolve; });

  const checkDone = () => {
    if (rootEnqueued > 0 && rootCompleted >= rootEnqueued) setImmediate(settle);
  };

  stream.on('test:enqueue', (e) => { if (e.nesting === 0) rootEnqueued++; });
  stream.on('test:complete', (e) => { if (e.nesting === 0) { rootCompleted++; checkDone(); } });
  stream.on('test:fail', (e) => {
    // A suite re-emits test:fail for each failing descendant; count leaves only
    // or a single failing test is reported twice.
    if (e.details && e.details.type === 'suite') return;
    failures++;
    console.error('[FAIL]', e.name, e.details?.error?.message ?? '');
  });
  stream.on('error', (err) => { failures++; console.error('[runner] stream error:', err); settle(); });

  stream.compose(spec).pipe(process.stdout);

  await finished;
  console.log(`[runner] done. root=${rootCompleted}/${rootEnqueued} failures=${failures}`);

  if (failures > 0) throw new Error(`${failures} test(s) failed.`);
}

module.exports = { run: runTests };
