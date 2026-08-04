# Spikes

Throwaway experiments kept on a branch for review. **Nothing here is wired into
the build, CI, or any package's `test` script.** Each subfolder is self-contained.

Context: these came out of an investigation into shrinking the dependency tree
to reduce Dependabot noise.

| Folder | Question it answers |
|---|---|
| [`dependency-analysis/`](./dependency-analysis) | Which direct dependencies actually cost us the most packages and the most Dependabot PRs? |
| [`node-test-in-extension-host/`](./node-test-in-extension-host) | Can `node:test` replace Mocha + `@vscode/test-cli` inside the VS Code extension host, and can we still get coverage without `c8`? |

## Headline findings

**Dependency tree** (605 reachable packages, 47 direct deps):

| Removal scenario | Packages removed | % of tree |
|---|---:|---:|
| `@vscode/vsce` | 190 | 31.4% |
| `@microsoft/vscode-azext-eng` | 73 | 12.1% |
| `eslint` | 42 | 6.9% |
| `@vscode/test-cli` + `mocha` (+ `c8`) | 59 | 9.8% |
| **`@vscode/vsce` + `@vscode/test-cli` + `mocha`** | **258** | **42.6%** |

`c8` adds nothing to the combined total because it is only reachable via
`@vscode/test-cli` — it leaves automatically.

Against 217 observed Dependabot PRs over 90 days, removing `@vscode/vsce` alone
would have eliminated ~103 of them (~47%), via chains like
`vsce → @secretlint/node → ajv → fast-uri` (27 PRs) and
`vsce → cheerio → undici` (20 PRs).

Note: there is no `.github/dependabot.yml` on the remotes, so all of these are
*automatic security updates*. That's why they target transitive dependencies and
why `open-pull-requests-limit` doesn't help. Adding a config with grouping is an
independent lever that works regardless of any tree changes.

**Test runner:** `node:test` does work in the extension host, and coverage is
achievable without `c8` — but see that folder's README for the real caveats
(a known open Node bug, plus Mocha features `node:test` silently lacks).
