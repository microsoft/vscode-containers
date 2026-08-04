// Measure how much of the dependency tree each direct dependency is responsible for.
// Parses pnpm-lock.yaml's snapshots graph and computes reachability.
import fs from 'node:fs';

const y = fs.readFileSync('pnpm-lock.yaml', 'utf8');
const lines = y.split(/\r?\n/);

// --- parse snapshots section into an adjacency map ---
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

function closure(roots) {
    const seen = new Set();
    const stack = [...roots];
    while (stack.length) {
        const r = resolve(stack.pop());
        if (!r || seen.has(r)) continue;
        seen.add(r);
        for (const c of graph.get(r) || []) stack.push(c);
    }
    return seen;
}

// --- parse importers section for direct deps ---
const impEnd = y.indexOf('\npackages:');
const impText = y.slice(0, impEnd > 0 ? impEnd : y.length);
const direct = new Map();
const re = /^\s{6}'?([^'\s:][^:]*?)'?:\s*\r?\n\s+specifier:[^\r\n]*\r?\n\s+version:\s*(\S+)/gm;
let m;
while ((m = re.exec(impText))) {
    direct.set(m[1] + '@' + m[2], m[1]);
}

const roots = [...direct.keys()];
const total = closure(roots);
console.log(`snapshot nodes: ${graph.size}`);
console.log(`direct deps (all workspaces): ${roots.length}`);
console.log(`total reachable packages: ${total.size}\n`);

const rows = [];
for (const [key, name] of direct) {
    const without = closure(roots.filter((r) => r !== key));
    rows.push({ name, uniquely: total.size - without.size });
}

const agg = new Map();
for (const r of rows) agg.set(r.name, Math.max(agg.get(r.name) ?? 0, r.uniquely));

console.log('Packages removed if this direct dep were dropped:');
[...agg.entries()]
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 25)
    .forEach(([n, c]) => console.log(String(c).padStart(5), n));
