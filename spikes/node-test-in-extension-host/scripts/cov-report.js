// Compute coverage for the spike's own source files straight from
// NODE_V8_COVERAGE output, with no c8 / istanbul dependency.
//
// This exists to answer one question: if we drop @vscode/test-cli, do we still
// need c8 (15 packages)? Answer: not for a basic signal. V8 gives per-function
// ranges directly; ranges[0] is the whole function and nested ranges with
// count 0 carve out the uncovered parts.
//
// Caveat: this yields byte + function coverage, NOT istanbul-grade
// line/branch coverage, and no lcov output for CI. If you need those, c8 is
// still the right tool.
const fs = require('fs');
const path = require('path');
const { fileURLToPath } = require('url');

function collect(covDir, srcDir) {
  const perFile = new Map();

  for (const f of fs.readdirSync(covDir).filter((n) => n.endsWith('.json'))) {
    let data;
    try {
      data = JSON.parse(fs.readFileSync(path.join(covDir, f), 'utf8'));
    } catch {
      continue; // a coverage file can be truncated if the host was killed
    }

    for (const script of data.result ?? []) {
      if (!script.url?.startsWith('file://')) continue;
      let file;
      try {
        file = fileURLToPath(script.url);
      } catch {
        continue;
      }

      // VS Code lowercases drive letters in URIs, so V8 reports d:\... while a
      // filesystem walk reports D:\... Compare case-insensitively on Windows or
      // the same file gets counted twice, silently deflating the numbers.
      const norm = file.toLowerCase();
      if (!norm.startsWith(srcDir.toLowerCase())) continue;
      if (norm.includes(`${path.sep}test${path.sep}`)) continue;

      const entry = perFile.get(norm) ?? { funcs: [], uncovered: [] };
      for (const fn of script.functions ?? []) {
        const whole = fn.ranges[0];
        entry.funcs.push({ name: fn.functionName || '(anonymous)', count: whole.count });
        for (const r of fn.ranges) if (r.count === 0) entry.uncovered.push([r.startOffset, r.endOffset]);
      }
      perFile.set(norm, entry);
    }
  }

  return perFile;
}

function report(covDir, srcDir = path.resolve(__dirname, '../src')) {
  const perFile = collect(covDir, srcDir);

  if (perFile.size === 0) {
    console.log('[coverage] NO SOURCE COVERAGE FOUND');
    return false;
  }

  for (const [file, entry] of perFile) {
    const size = fs.statSync(file).size;

    // Merge overlapping uncovered ranges before measuring.
    const merged = [];
    for (const [s, e] of entry.uncovered.sort((a, b) => a[0] - b[0])) {
      const last = merged[merged.length - 1];
      if (last && s <= last[1]) last[1] = Math.max(last[1], e);
      else merged.push([s, e]);
    }
    const uncoveredBytes = merged.reduce((n, [s, e]) => n + (e - s), 0);
    const pct = (((size - uncoveredBytes) / size) * 100).toFixed(2);

    const totalFns = entry.funcs.length;
    const hitFns = entry.funcs.filter((f) => f.count > 0).length;

    console.log(`\n${path.basename(file)}`);
    console.log(`  bytes covered : ${pct}%  (${size - uncoveredBytes}/${size})`);
    console.log(`  functions     : ${((hitFns / totalFns) * 100).toFixed(2)}%  (${hitFns}/${totalFns})`);
    const missed = entry.funcs.filter((f) => f.count === 0).map((f) => f.name);
    if (missed.length) console.log(`  uncovered fns : ${missed.join(', ')}`);
  }

  return true;
}

module.exports = { report, collect };

if (require.main === module) {
  const dir = process.argv[2];
  if (!dir) {
    console.error('usage: node cov-report.js <NODE_V8_COVERAGE-dir>');
    process.exit(2);
  }
  process.exit(report(dir) ? 0 : 1);
}
