// Isolates nodejs/node#60020: which run() option makes the stream never end?
//
//   node matrix.js            -> runs all four combinations
//
// Expected: both isolation:'none' rows HANG, both isolation:'process' rows
// drain. The reporter is irrelevant; isolation is the only variable that
// matters.
const path = require('path');
const { spawnSync } = require('child_process');
const { run } = require('node:test');
const { spec } = require('node:test/reporters');

const file = path.resolve(__dirname, 'sample.test.js');
const MODES = ['iso-none+spec', 'iso-none+raw', 'iso-proc+spec', 'iso-proc+raw'];

async function child(mode) {
  const opts = { files: [file], concurrency: false, timeout: 20000 };
  if (mode.includes('iso-none')) opts.isolation = 'none';
  const useSpec = mode.includes('spec');

  const watchdog = setTimeout(() => {
    console.log(`RESULT ${mode.padEnd(14)}: HANG    resources=${JSON.stringify(process.getActiveResourcesInfo())}`);
    process.exit(99);
  }, 8000);

  const stream = run(opts);
  const src = useSpec ? stream.compose(spec) : stream;
  for await (const chunk of src) void chunk;

  console.log(`RESULT ${mode.padEnd(14)}: DRAINED OK`);
  clearTimeout(watchdog);
}

if (process.argv[2]) {
  child(process.argv[2]).catch((e) => {
    console.log(`RESULT ${process.argv[2]}: ERROR ${e.message}`);
    process.exit(1);
  });
} else {
  for (const m of MODES) {
    const r = spawnSync(process.execPath, [__filename, m], { encoding: 'utf8' });
    const line = (r.stdout || '').split('\n').find((l) => l.startsWith('RESULT'));
    console.log(line ?? `RESULT ${m}: <no output>`);
  }
}
