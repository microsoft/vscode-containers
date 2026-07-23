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

- **Severity**: blocking (correctness / resource / localization / a pattern violation that
  creates a concrete functional or maintenance risk) vs non-blocking (nit, style, optional
  improvement) vs open question (ask, do not assert). A stated preference is not blocking by
  itself; explain the concrete risk when grading a house-style violation as blocking.
- **Confidence**: only raise a point you can ground in the diff or a concrete repo
  convention, and cite the exact helper/pattern the author should use instead. If you are
  guessing, downgrade it to an open question or drop it.

Prefer **high signal, low noise** -- but "low noise" means *no speculation*, not *few
findings*. Be **thorough on the changed lines**: surface every substantive issue you can ground
in the diff or a concrete convention, not just the top three. Maintainers review closely and
raise many small, real points per PR; a review that grounds ten real issues is better than one
that stops at three and leaves grounded problems uncommented. The bar for including a point is
confidence, not scarcity: if you can name the exact line and the concrete fix, include it; if
you are guessing, drop it or make it an open question.

## Higher scrutiny for agent-authored PRs

If the PR is authored by an agent (title starts with an agent marker such as the robot emoji,
or the author is a bot like `Copilot` / `dependabot`), look **more carefully** at the known
agent failure modes -- over-engineering, duplicated helpers, hard-coded strings that should be
localized, unnecessary defensive code, PR-narrative comments left in source. This raises where
you look, not the bar: every finding still needs the same grounding. For human authors, give
benefit of the doubt and **ask** when something looks odd but could be intentional.

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

### Reuse before adding (check first)
- This is the **single most common** maintainer request. Before accepting a new helper,
  constant, URL, type, or utility the PR introduces, check whether one already exists and should
  be reused instead: an existing constant/URL (e.g. a shared `dockerHubUrl`, `learnMore`
  property), an existing helper doing the same job (e.g. `fse.readJSON` instead of `readFile` +
  `JSON.parse`, `path.resolve`/`path.normalize` instead of hand-rolled separator logic, an
  existing `addVolumeWithoutConflicts`-style helper), or an existing base class the new code
  should extend rather than duplicate. Name the concrete existing thing to reuse.
- Keep the public/extension **API surface minimal**: flag new parameters, options, or config
  fields the caller did not ask for and that nothing yet consumes. Add options only when a real
  caller needs them.

### Localization
- **Every user-facing string must be localized** with `vscode.l10n.t('...')`. Flag any
  hard-coded visible string (messages, quick-pick labels/placeholders, notifications, errors,
  `package.json` contributions via `package.nls.json`). Legacy `localize(...)` is gone; new
  code uses `vscode.l10n.t`. Spell terms out in user-facing text (e.g. "Software Bill of
  Materials", not "SBOM") where a maintainer has asked for it; skip routine grammar/punctuation
  nits.

### Async / await
- Mixing `try/catch` with promises **without** `await` hides errors -- ensure rejections are
  awaited inside the `try` (a fire-and-forget call in a `try` will not be caught).
- Intentional fire-and-forget must be explicit: prefix the call with `void`, and make sure a
  rejection cannot go unhandled (attach a handler or `await` in a `try/catch` when the call can
  fail meaningfully). Do not demand an explanatory comment on every `void`.
- After an `await`, re-check any guard state you relied on before it -- but only when that state
  is shared/mutable and can actually change across the await (reentrancy).

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
  value. Flag it when you can point to a legitimate falsy case the `||` mishandles.
- Keep return types honest -- if a value can be undefined, the signature must be
  `T | undefined`, and guard the resulting possibly-undefined access.

### TypeScript typing
- Prefer an `enum` or string-literal union over a bare `boolean` parameter **for an
  exported/public API or an ambiguous call site** so callers are self-documenting; do not
  demand it for a clear private helper.
- Avoid introducing new avoidable `any`; the command-wrapper signatures that legitimately use
  `any[]` are an established boundary, not a target.

### Command-line / regex construction
- Build container/CLI commands with the arg helpers from `@microsoft/vscode-processutils`
  (`composeArgs`, `withArg`, `withNamedArg`, `withQuotedArg`, with the `shouldQuote` /
  `assignValue` options) instead of string interpolation -- they handle quoting/escaping.
  Escaping differs per shell/OS (especially Windows); prefer `withQuotedArg` / `shouldQuote`
  over hand-rolled quoting. See `extensions/vscode-containers/src/tasks/netSdk/netSdkTaskUtils.ts` and
  `extensions/vscode-containers/src/debugging/netcore/*` for current usage.
- Regex: escape `.` as `\.`, anchor correctly, and watch for accidental matches -- flag one
  when you can point to the concrete input it would mis-match, not merely because it looks
  complex.

### UI / UX
- Accessibility: refer to UI elements by name, not relative position ("the button on the
  left") -- screen readers cannot rely on position. (Open question unless clearly wrong.)
- Flag a redundant toast / progress notification only when you can name the concrete duplicate
  or misleading path (e.g. two popups for one failure).
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
- Linux filesystems are case-sensitive: import path casing must match exactly or the Linux
  build breaks.
- Container/CLI command construction must work across cmd, PowerShell, and git bash on Windows
  -- lean on the `@microsoft/vscode-processutils` arg helpers (above) rather than hand-rolled
  quoting.

### Contracts / client / registry packages (imported extensibility)
**Apply this section ONLY to changes under `packages/**`** -- the imported source of
`vscode-docker-extensibility` (`@microsoft/vscode-container-client`,
`@microsoft/vscode-docker-registries`) and `compose-language-service`, arriving via the open
import PRs. These do **not** apply to `extensions/**` consumer code, which merely depends on the
published packages. If `packages/**` is not in the diff, skip this section. For changes that
are under those packages, apply -- they are the patterns those maintainers raise most:
- **Self-contained public contracts.** Define the types a contract exposes in the contract file;
  do not couple a public API to implementation-only types. Re-export intended public symbols from
  the package entrypoint, and share cross-cutting errors (e.g. `CancellationError`,
  `CommandNotSupportedError`) rather than redefining them. Duplicate a small type before coupling
  a contract to an implementation.
- **CancellationToken ownership.** Public APIs should accept a `CancellationToken`, not a
  `CancellationTokenSource` -- the caller that creates the `CTS` owns cancellation and disposal.
  Long/streaming operations (including generators and parsers) should take and honor a token and
  throw `CancellationError` on cancel.
- **Schema-based parsing.** Validate and normalize external CLI/registry JSON with shared `zod`
  schemas (`preprocess` around `JSON.parse`, `transform` for normalization) instead of ad-hoc
  `JSON.parse` plus manual conversion; remember MSBuild returns `"true"`/`"false"` strings
  (`z.stringbool()`), and fields like `Created` can be null.
- **Command-runner stream lifecycle.** Runners that pipe or generate process output must drain or
  close every stream copy (pipe copies cause back-pressure), await the process, and propagate a
  process failure as a thrown error rather than silently returning empty output.
- **Image/tag modeling.** Represent image references with the original text plus parsed optional
  parts; treat Docker sentinels like `<none>` as missing data, and cover parser edge cases
  (`alpine:5` is a tag, not a registry host) with tests. Prefer the client's parsed fields over
  re-parsing references by hand.
- **Registry connection state.** Connect/disconnect flows must keep persisted IDs, caches,
  tree-provider state, and stored credentials in sync; re-adding a registry should be idempotent
  (overwrite), and removal should clean up the stored session.
- **Package export loadability.** Ensure an exported entrypoint's module format matches the
  package `type` (no ESM `.js` behind a CommonJS package), and that everything a public
  entrypoint imports is a real `dependency`/`peerDependency`, not a `devDependency`.

### Dependencies / manifests
- Keep dependency changes scoped to the workspace that needs them: flag a dependency added to
  the root manifest (or a stray root `devDependency`) when only one extension/package uses it.
  Name the workspace that should own it.
- When a **changed** dependency declares its own engine requirement, check it against `.nvmrc`.
  Do not review generated `pnpm-lock.yaml` entries line by line -- confirm the lockfile change
  is the expected result of the manifest change.

### Comments / docs / tests
- Comments should explain **why** for surprising / platform / protocol logic; add a source
  permalink when porting logic from elsewhere. Do not ask for comments on obvious code.
- Factor pure logic (version comparison, parsing) into unit-testable functions; when a test
  exercises sorting, use input that is not already sorted.
- In timing tests, avoid tight wall-clock upper-bound assertions (CI VMs stall); assert
  ordering or use repeated samples if a bound is essential.
- Flag a genuine whole-file rewrite or line-ending conversion that buries the real change and
  pollutes `git blame`; ignore ordinary formatter output.

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
- Do not review `NOTICE.html`; it is a curated artifact that must not be hand-edited.

When you do propose an alternative, make it concrete (sketch the code / name the files) and say
*why* it is better -- simpler, safer, faster, or more maintainable. "Did you consider X?" is
fine when you have thought X through enough to defend it.

## Verdict shape

Frame the review as:

1. **Verdict** -- one line: ready / needs changes / needs discussion.
2. **Blocking issues** -- correctness, resource, localization, or pattern violations that must
   be fixed, each with file:line and the concrete fix.
3. **Non-blocking suggestions** -- improvements and nits worth making; omit if there are none.
4. **What looks good** -- optional, one line; skip it rather than pad the review.
5. **Open questions** -- material ambiguities to ask the author about rather than assert (not a
   dumping ground for low-confidence findings).

Never approve -- approval is a human maintainer's decision. A review either raises comments or
requests changes; it does not sign off.
