// Dumps EVERY event the run() stream emits, in order, with timestamps.
//
// Under isolation:'none' this shows all work finishing (~65ms) followed by
// total silence: no 'end', no 'close', no 'test:summary', and no root-level
// 'test:plan'. That silence is nodejs/node#60020.
const path = require('path');
const { run } = require('node:test');

const files = ['multi-a.test.js', 'multi-b.test.js'].map((f) => path.resolve(__dirname, f));
const stream = run({ files, isolation: 'none', concurrency: false, timeout: 20000 });

const t0 = Date.now();
const origEmit = stream.emit.bind(stream);
stream.emit = (name, ...args) => {
  const d = args[0];
  const desc = d && typeof d === 'object'
    ? `${d.name ?? ''}${d.nesting !== undefined ? ` n=${d.nesting}` : ''}${d.count !== undefined ? ` count=${d.count}` : ''}`
    : String(d ?? '').slice(0, 60);
  console.log(`${String(Date.now() - t0).padStart(5)}ms  ${name.padEnd(18)} ${desc}`);
  return origEmit(name, ...args);
};

stream.on('data', () => {}); // drive the stream so events flow

setTimeout(() => { console.log('--- watchdog exit (stream never ended) ---'); process.exit(0); }, 6000);
