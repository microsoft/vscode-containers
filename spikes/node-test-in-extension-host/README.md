# Spike: `node:test` inside the VS Code extension host

**Status: working proof of concept, verified end to end. Not production code.**

Answers two questions:

1. Can `node:test` replace Mocha + `@vscode/test-cli` for extension tests?
   **Yes** — but with a workaround for an open Node bug, and with real feature
   gaps versus Mocha.
2. If we drop `@vscode/test-cli`, do we still need `c8` for coverage?
   **Not for a basic signal** — see [`scripts/cov-report.js`](./scripts/cov-report.js).

## Run it

```powershell
# Full run: launches VS Code, runs tests in-host, prints coverage (~30s)
node scripts/run-tests.mjs

# Fast harnesses, no Electron (~1s each)
node repro/matrix.js      # isolates the Node bug
node repro/detector.js    # self-checks the completion detector
node repro/allevents.js   # dumps every stream event, shows the silence
```

No install step: `@vscode/test-electron` is resolved from
`extensions/vscode-containers/node_modules` (pnpm does not hoist it to the root).
The downloaded VS Code build lands in `.vscode-test/`, already gitignored.

Verified output:

```
[runner] node:test files: 1
▶ poc suite
  ✔ add works
  ✔ vscode api present
[runner] done. root=1/1 failures=0
TEST RUN PASSED

extension.js
  bytes covered : 69.63%
  functions     : 40.00%  (2/5)
  uncovered fns : neverCalled, activate, deactivate
```

A deliberately failing test was also verified: reports the failure, exits 1,
does not hang. (`activate`/`deactivate` show uncovered because nothing activates
the fake extension — that's expected, and it demonstrates the report is real.)

## The one real gotcha: nodejs/node#60020

`isolation: 'none'` is **mandatory** here — it's what runs tests in the same
process as the extension host, which is the only reason `require('vscode')`
resolves. `isolation: 'process'` would defeat the entire purpose.

And `isolation: 'none'` is broken upstream:
[nodejs/node#60020](https://github.com/nodejs/node/issues/60020), open since
September 2025. The stream returned by `run()` **never emits `end`** — nor
`test:summary`, nor a root-level `test:plan`. Every other event fires correctly,
then the stream goes permanently silent. Awaiting `end`, or `for await`-ing the
composed reporter, hangs forever.

This is easy to misdiagnose as an Electron/extension-host problem. It isn't —
`repro/matrix.js` reproduces it in plain Node in seconds:

| isolation | reporter | result |
|---|---|---|
| `none` | `spec` | **HANG** |
| `none` | raw | **HANG** |
| `process` | `spec` | drains OK |
| `process` | raw | drains OK |

The reporter is irrelevant. `isolation` is the only variable that matters.

### The workaround

`run()` enqueues **every root-level item before executing any of them**.
Verified for CJS *and* for ESM with top-level await (all enqueues at 38–39 ms,
first completion at 42 ms). So completion is detectable by counting
`test:enqueue` vs `test:complete` at `nesting === 0`. That's ~10 lines in
[`runner/index.js`](./runner/index.js).

Two subtleties worth keeping if this ever ships:

- **Suites re-emit `test:fail` for each failing descendant.** Count leaves only
  (`e.details.type !== 'suite'`) or one failing test is reported twice.
- **Counting `test:plan` instead does not work** — under `isolation: 'none'` the
  root-level `test:plan` never fires with multiple files.

`repro/detector.js` self-checks the detector across all-passing, with-failure,
and single-file cases and exits non-zero if any regress. Worth running against
new Node versions — ideally it starts failing because the upstream bug got fixed.

## Coverage without c8

`NODE_V8_COVERAGE` is the *entire* coverage mechanism — there is no
instrumentation step. `@vscode/test-cli` does exactly this and then hands the
output to `c8`. `scripts/cov-report.js` parses that raw V8 JSON directly in ~40
lines with zero dependencies, and correctly identifies uncovered functions.

**Caveat:** it produces byte + function coverage, **not** istanbul-grade
line/branch coverage, and no `lcov` output for CI. If those matter, `c8` comes
back (15 packages) — though `c8` only costs us anything if we keep it
deliberately, since it leaves for free along with `@vscode/test-cli`.

### Windows drive-letter trap

VS Code lowercases drive letters in URIs, so V8 reports `d:\...` while a
filesystem walk reports `D:\...`. Anything comparing those paths case-sensitively
counts each file twice — once at 0% — which **silently deflates coverage with no
error**. This cost real debugging time in an earlier spike (82.92% reported vs
97.14% actual). `cov-report.js` normalizes case; if you use `c8` directly you
need its `relativePath = false` equivalent.

## What still blocks adoption

- **`{ retries: n }` is silently ignored by `node:test`.** No warning, test runs
  once. Verified on Node v24.18.0. This is the biggest functional gap vs Mocha.
- **No TDD interface** (`suiteSetup`/`suiteTeardown` don't exist) and **no
  dynamic `this.timeout()`** (absent from the `TestContext` prototype).
  `extensions/vscode-containers/src/test/global.test.ts` currently uses TDD
  hooks, `mocha.Context`, and `this.timeout(60_000)` together, so it would need
  rewriting.
- **`.vscode-test.mjs` re-exports shared config** from
  `@microsoft/vscode-azext-eng/vscode-test`, including a macOS/Linux
  `--user-data-dir` hashing workaround for the AF_UNIX `sun_path` 104-char limit
  in deep checkouts. Any replacement has to carry that forward.
- Adopting this means **depending on a workaround for an open upstream bug**.
  Cheap to maintain and well-covered by `repro/detector.js`, but it is a bet.

`node:test` does win on one thing Mocha never had: built-in mocking
(`mock.fn` / `mock.method` / `mock.timers` / module mocks).

## Layout

| Path | Purpose |
|---|---|
| `src/extension.js` | Fake extension; `neverCalled` is never invoked so coverage has something to mark. |
| `src/test/poc.test.js` | Asserts `require('vscode')` resolves in-host. |
| `runner/index.js` | The in-host runner + the #60020 completion detector. |
| `scripts/run-tests.mjs` | Launcher; sets `NODE_V8_COVERAGE`. |
| `scripts/cov-report.js` | Dependency-free coverage report. Also runnable standalone. |
| `repro/matrix.js` | Isolates the bug to the `isolation` option. |
| `repro/allevents.js` | Dumps every event; shows the silence after work finishes. |
| `repro/detector.js` | Self-checking validation of the completion detector. |
