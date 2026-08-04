# Dependency tree analysis

Ad-hoc scripts for working out which direct dependencies actually cost us
packages and Dependabot PRs. They parse `pnpm-lock.yaml`'s `snapshots:` section
into an adjacency graph and do reachability analysis on it.

**Run from the repo root** — they read `pnpm-lock.yaml` from the current
directory.

## `dep-whatif.mjs` — the useful one

Removes a package (or set of packages) from the graph entirely and reports how
many packages fall out of the reachable set.

```powershell
node spikes/dependency-analysis/dep-whatif.mjs "@vscode/vsce" "@vscode/test-cli,mocha,c8"
```

```
baseline reachable: 605

 190 pkgs ( 31.4%)  removed if [@vscode/vsce] were gone
  59 pkgs (  9.8%)  removed if [@vscode/test-cli + mocha + c8] were gone
```

Comma-separated names are treated as one combined scenario. Use that for
anything you'd remove together — shared transitive deps mean the combined figure
is **not** the sum of the individual ones.

## `dep-closure.mjs` — leave-one-out over every direct dep

Reports packages uniquely attributable to each direct dependency. Less useful in
practice: shared dependencies mask the true cost, so a package can look cheap
only because something else also pulls its subtree.

## `dep-prnoise.mjs` — ties the graph to observed PR volume

Cross-references the graph against a hardcoded map of Dependabot PR counts to
compute how many PRs a removal would have eliminated.

**The `prCounts` map is a point-in-time snapshot** (90 days, ~217 PRs, gathered
in this investigation). Re-gather it before trusting the output:

```powershell
gh pr list -R microsoft/vscode-containers --author "app/dependabot" --state all --limit 200 --json title,createdAt
```

The counts were gathered fleet-wide across 12 repos and then mapped onto *this*
repo's tree, so treat the absolute numbers as directional. Other repos have
different trees, though they share `@microsoft/vscode-azext-eng`.

## Findings

| Scenario | Packages removed | % of tree |
|---|---:|---:|
| `@vscode/vsce` | 190 | 31.4% |
| `@microsoft/vscode-azext-eng` | 73 | 12.1% |
| `eslint` | 42 | 6.9% |
| `esbuild` | 27 | 4.5% |
| `@vscode/test-electron` | 26 | 4.3% |
| `@vscode/test-cli` | 19 | 3.1% |
| `mocha` | 17 | 2.8% |
| `c8` | 15 | 2.5% |
| `@vscode/test-cli` + `mocha` | 59 | 9.8% |
| `@vscode/test-cli` + `mocha` + `c8` | 59 | 9.8% |
| **`@vscode/vsce` + `@vscode/test-cli` + `mocha`** | **258** | **42.6%** |

Baseline: 605 reachable packages, 626 snapshot nodes, 47 direct deps.

Two things worth noting:

- **`c8` is free to remove.** It's only reachable via `@vscode/test-cli`, so it
  leaves automatically — which is why the last two `test-cli` rows are identical.
- **`@vscode/vsce` is a devDependency** (`"@vscode/vsce": "^3.9.2"`) *and* a peer
  of `@microsoft/vscode-azext-eng`, so it has to go from both places. It's only
  used as `vsce package --no-dependencies`, so `pnpm dlx` would drop it from the
  lockfile entirely.

### Dependabot context

There is **no `.github/dependabot.yml` on the remotes** (verified via `gh api`,
not just locally). Every one of these PRs is therefore an *automatic security
update*, which is why they target deeply transitive packages and why
`open-pull-requests-limit` has no effect on them.

Removing `@vscode/vsce` would have eliminated ~103 of 217 PRs (~47%), via
chains like:

- `vsce → @secretlint/node → ajv → fast-uri` — 27 PRs
- `vsce → cheerio → undici` — 20 PRs
- `vsce → typed-rest-client → qs` — 12 PRs
- `vsce → markdown-it → linkify-it` — 10 PRs
- plus direct `form-data` (11) and `tmp` (12)

Surviving that removal: `@nevware21/ts-utils` (15, via `@vscode/extension-telemetry`,
a **runtime** dep), `js-yaml` (19, also via `mocha`), `brace-expansion` (11),
`esbuild` (11), `tar` (4).

Adding a `dependabot.yml` with grouping is a separate, faster lever — no code
risk, and it works regardless of whether the tree shrinks.
