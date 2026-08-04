// What-if analysis: remove a package from the graph entirely (all edges to it)
// and measure how many packages fall out of the reachable set.
import fs from 'node:fs';

const y = fs.readFileSync('pnpm-lock.yaml', 'utf8');
const lines = y.split(/\r?\n/);

let inSnap = false;
let cur = null;
const graph = new Map();
for (const ln of lines) {
    if (/^snapshots:/.test(ln)) { inSnap = true; continue; }
    if (inSnap && /^[a-zA-Z]/.test(ln)) { inSnap = false; }
    if (!inSnap) continue;
    const node = ln.match(/^  '?(.+?)'?:(\s*\{\})?\s*$/);
    if (node && !/^\s{4}/.test(ln)) {
        cur = node[1];
        if (!graph.has(cur)) graph.set(cur, []);
        continue;
    }
    const edge = ln.match(/^      '?([^':]+?)'?:\s*(\S+)\s*$/);
    if (edge && cur) graph.get(cur).push(edge[1] + '@' + edge[2]);
}

const keys = [...graph.keys()];
const byBase = new Map();
for (const k of keys) {
    const base = k.split('(')[0];
    if (!byBase.has(base)) byBase.set(base, k);
}
const resolve = (k) => (graph.has(k) ? k : byBase.get(k));
const nameOf = (k) => k.split('(')[0].replace(/@[^@]+$/, '');

function closure(roots, banned = new Set()) {
    const seen = new Set();
    const stack = [...roots];
    while (stack.length) {
        const raw = stack.pop();
        if (!raw) continue;
        if (banned.has(nameOf(raw))) continue;
        const r = resolve(raw);
        if (!r || seen.has(r)) continue;
        seen.add(r);
        for (const c of graph.get(r) || []) stack.push(c);
    }
    return seen;
}

const impEnd = y.indexOf('\npackages:');
const impText = y.slice(0, impEnd > 0 ? impEnd : y.length);
const direct = [];
const re = /^\s{6}'?([^'\s:][^:]*?)'?:\s*\r?\n\s+specifier:[^\r\n]*\r?\n\s+version:\s*(\S+)/gm;
let m;
while ((m = re.exec(impText))) direct.push(m[1] + '@' + m[2]);

const base = closure(direct);
console.log(`baseline reachable: ${base.size}\n`);

// Each argument is a scenario: comma-separated packages removed together.
const scenarios = process.argv.slice(2);
for (const s of scenarios) {
    const pkgs = s.split(',').map((x) => x.trim()).filter(Boolean);
    const after = closure(direct, new Set(pkgs));
    const removed = base.size - after.size;
    const pct = ((removed / base.size) * 100).toFixed(1);
    console.log(`${String(removed).padStart(4)} pkgs (${pct.padStart(5)}%)  removed if [${pkgs.join(' + ')}] were gone`);
}
