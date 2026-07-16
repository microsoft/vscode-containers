# Container Tools review rubric (shared)

This is the shared grading rubric used by both PR-review skills in this repo:

- `code-review` -- the skill the cloud Copilot code reviewer auto-invokes on a PR.
- `review-pr` -- the on-demand skill a maintainer runs from the CLI against any PR.

It defines **what to look for and how to grade** a change to
`microsoft/vscode-containers` (formerly `microsoft/vscode-docker`). It says nothing about
*how* to fetch a PR or *where* to post -- each skill handles that. Review the change as a
maintainer would: not just "does it work," but "does it fit this codebase" -- established
patterns, maintainability, localization, resource/error handling, and no more complexity than
needed.

The **Repo-specific patterns** below were distilled from thousands of real maintainer review
comments on this repo. Treat them as house style. They are curated and **not exhaustive** --
they capture the issues maintainers raise most often, not every possible issue. Use them to
prioritize, then apply general engineering judgment for anything they do not cover.

## How to grade

Judge each finding on two axes and only surface what earns its place:

- **Severity**: blocking (correctness / resource / localization / clear pattern violation) vs
  non-blocking (nit, style, optional improvement) vs open question (ask, do not assert).
- **Confidence**: only raise a point you can ground in the diff or a concrete repo
  convention, and cite the exact helper/pattern the author should use instead. If you are
  guessing, downgrade it to an open question or drop it.

Prefer **high signal, low noise**. A short review that names three real problems beats a long
one padded with speculation.

## Higher scrutiny for agent-authored PRs

If the PR is authored by an agent (title starts with an agent marker such as the robot emoji,
or the author is a bot like `Copilot` / `dependabot`), review with **higher scrutiny** --
agents commonly over-engineer, duplicate existing helpers, hard-code strings that should be
localized, add unnecessary defensive code, or leave PR-narrative comments in source. For human
authors, give benefit of the doubt and **ask** when something looks odd but could be
intentional.

## Scope and intent (every PR)

1. Does the title/description explain *why*, not just *what*? Will it read cleanly as a
   squash-merge commit message?
2. Do the changes match the stated scope? Flag unexplained scope creep or missing changes the
   description implies.
3. If a linked issue exists, does the PR actually address it? (A partial fix is fine if the PR
   says so; a silent mismatch is not.)

Classify the changed files to decide which patterns apply most: command/UI code
(`extensions/vscode-containers/src/commands/**`, tree items), tasks/debugging
(`extensions/vscode-containers/src/tasks/**`, `extensions/vscode-containers/src/debugging/**`),
scaffolding, runtime/CLI clients, `package.json` / `package.nls.json` contributions and
settings, or tests.

## Repo-specific patterns

Apply these. Cite the concrete helper or convention the author should use.

### Localization
- **Every user-facing string must be localized** with `vscode.l10n.t('...')`. Flag any
  hard-coded visible string (messages, quick-pick labels/placeholders, notifications, errors,
  `package.json` contributions via `package.nls.json`). Legacy `localize(...)` is gone; new
  code uses `vscode.l10n.t`.
- Message style: avoid contractions in user-facing text; keep trailing-period usage
  consistent; prefer clear, full wording.

### Async / await
- Do not mark a function `async` if its body is synchronous.
- Mixing `try/catch` with promises **without** `await` hides errors -- ensure rejections are
  awaited inside the `try`.
- Intentional fire-and-forget must be explicit: prefix the call with `void` **and** a short
  comment that you are deliberately not awaiting.
- `vscode.window.withProgress(...)` returns the inner callback's value -- await it instead of
  stashing extra locals.
- After an `await`, re-check any guard state you relied on before it (reentrancy).
- Consider `Promise.all` for independent CLI calls.

### Disposables / resource lifetime
- `CancellationTokenSource`, `EventEmitter<T>`, `createOutputChannel()`, event subscriptions,
  and timers are disposable. Dispose them in a `finally`, or push them onto
  `context.subscriptions` for extension-lifetime cleanup. `clearTimeout` disposes timers.

### Error handling
- Prefer specific `catch` blocks; use `parseError` (from `@microsoft/vscode-azext-utils`) to
  classify errors rather than assuming the cause.
- Cancellation is signaled by throwing `UserCancelledError`. Many helpers (e.g. the shared
  quick-pick / UI helpers) already throw it, so redundant "user cancelled" checks are not
  needed.
- Wrap command entry points in `callWithTelemetryAndErrorHandling`. Error / no-item messages
  must be localized.

### null / undefined
- Choose `||` vs `??` deliberately: `||` treats `''` / `0` / `false` as "use default"; `??`
  only defaults on null/undefined. This matters for settings where empty string is a real
  value.
- Guard array access on possibly-undefined values; a non-empty check often needs both a
  defined check **and** `length > 0`.
- Keep return types honest -- if a value can be undefined, the signature must be
  `T | undefined`.
- Prefer real `undefined` over `''` / "(not set)" in telemetry; do not write explicit
  default/`undefined` config into `tasks.json`.

### TypeScript typing
- TS is **structurally** typed -- two interfaces with the same shape are interchangeable, so
  distinct names alone do not prevent mix-ups.
- Prefer an `enum` or string-literal union over a bare `boolean` parameter so call sites are
  self-documenting.
- Avoid `any`; keep public/extension API surface minimal (add options only when needed).

### Declarations / style
- Prefer `const`; use `private readonly` on constructor parameter properties.
- Single quotes for strings; `export const X` over `export default`; avoid `=== true`.

### Command-line / regex construction
- Build container/CLI commands with the arg helpers from `@microsoft/vscode-processutils`
  (`composeArgs`, `withArg`, `withNamedArg`, `withQuotedArg`, with the `shouldQuote` /
  `assignValue` options) instead of string interpolation -- they handle quoting/escaping.
  Escaping differs per shell/OS (especially Windows); prefer `withQuotedArg` / `shouldQuote`
  over hand-rolled quoting. See `extensions/vscode-containers/src/tasks/netSdk/netSdkTaskUtils.ts` and
  `extensions/vscode-containers/src/debugging/netcore/*` for current usage.
- Regex: escape `.` as `\.`, anchor correctly, and watch for accidental matches elsewhere in a
  path or command line.

### UI / UX
- Prefer a QuickPick (shows all options at once) over multi-click "cycle" buttons.
- Accessibility: refer to UI elements by name, not relative position ("the button on the
  left") -- screen readers cannot rely on position.
- Avoid redundant toasts / progress notifications.
- Commands that should not appear in the Command Palette need a `when` clause / menu
  restriction in `package.json`.

### Telemetry
- Do not emit telemetry from tests (`DEBUGTELEMETRY=1` is set for tests).
- Renaming/moving/removing telemetry breaks existing queries and dashboards -- flag it.
- Do not inflate counts by invoking a command internally just to reuse its logic.

### Configuration / settings
- Prefer a contributed **setting** over `globalState` (discoverable, per-workspace,
  shareable). Get the setting **scope** right (e.g. machine-scoped to separate remote vs
  local).
- Deprecate a setting with `deprecationMessage` for at least one release before removing;
  check telemetry for usage first.
- Mind precedence between VS Code settings and environment variables (e.g. `docker.host` vs
  `DOCKER_HOST`).

### Cross-platform
- Prefer Node `os.platform()` / `os.arch()` over bespoke OS-provider abstractions.
- Linux filesystems are case-sensitive: import path casing must match exactly or the Linux
  build breaks.
- Consider cmd, PowerShell, and git bash behavior on Windows.

### Comments / docs / tests
- Comments explain **why**, not what; add a source link when porting logic from elsewhere.
- Replace "what does `true` mean" comments with a typed parameter.
- Factor pure logic (version comparison, parsing) into unit-testable functions; use test data
  that is not already sorted so sorting logic is actually exercised.

## General correctness (every PR)

Beyond the repo patterns, check: logic / off-by-one / null-path bugs, race conditions and
reentrancy, resource leaks, error masking (caching/telemetry/logging swallowing a primary
error), duplication of an existing helper (name the helper that should be reused), dead code
and debug leftovers, new public API only consumed by tests, and inconsistencies with
surrounding code (naming, types, logging, error handling) without a clear reason.

This is a pnpm monorepo with ESLint. Flag obvious lint/type violations, but do not run heavy
builds as part of a review unless explicitly asked.

## What NOT to flag

- Style already consistent with the codebase.
- Pre-existing issues in unchanged code (mention in the summary if relevant; do not block on
  them).
- Alternative approaches that are merely different, not clearly better.
- Missing XML/JSDoc unless it is public API or the surrounding code documents everything else.
- Theoretical concerns that do not manifest in practice.
- Files that must not be hand-edited / reviewed line-by-line (generated or curated files) --
  see the repo's custom instructions.

When you do propose an alternative, make it concrete (sketch the code / name the files) and say
*why* it is better -- simpler, safer, faster, or more maintainable. "Did you consider X?" is
fine when you have thought X through enough to defend it.

## Verdict shape

Frame the review as:

1. **Verdict** -- one line: ready / needs changes / needs discussion.
2. **Blocking issues** -- correctness, resource, localization, or pattern violations that must
   be fixed, each with file:line and the concrete fix.
3. **Non-blocking suggestions** -- improvements and nits.
4. **What looks good** -- brief.
5. **Open questions** -- things to ask the author rather than assert.

Never approve -- approval is a human maintainer's decision. A review either raises comments or
requests changes; it does not sign off.
