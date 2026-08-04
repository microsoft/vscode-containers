// For each noisy package, determine whether it is reachable ONLY via a given root.
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

// PR counts observed across the fleet over 90 days
const prCounts = {
    'fast-uri': 27, undici: 20, 'js-yaml': 19, '@nevware21/ts-utils': 15,
    tmp: 12, qs: 12, 'brace-expansion': 11, esbuild: 11, 'form-data': 11,
    'markdown-it': 10, ws: 9, 'linkify-it': 9, uuid: 7, 'fast-xml-builder': 6,
    dompurify: 5, tar: 4, 'simple-git': 4, immutable: 3, postcss: 2, lodash: 2,
    'fast-xml-parser': 2, minimatch: 2, hono: 2,
};

const target = process.argv[2] || '@vscode/vsce';
const baseNames = new Set([...closure(direct)].map(nameOf));
const afterNames = new Set([...closure(direct, new Set([target]))].map(nameOf));

let eliminated = 0;
let survives = 0;
const gone = [];
const stays = [];
for (const [pkg, count] of Object.entries(prCounts)) {
    if (!baseNames.has(pkg)) continue;
    if (afterNames.has(pkg)) { survives += count; stays.push(`${pkg} (${count})`); }
    else { eliminated += count; gone.push(`${pkg} (${count})`); }
}

console.log(`=== Removing "${target}" ===`);
console.log(`PRs eliminated: ${eliminated}`);
console.log(`PRs remaining:  ${survives}\n`);
console.log('ELIMINATED:', gone.sort().join(', ') || '(none)');
console.log('\nSTILL PRESENT:', stays.sort().join(', ') || '(none)');
