# Copilot instructions — Container Tools extension

Container Tools (`vscode-containers`, publisher `ms-azuretools`) is the Visual Studio Code
extension for building, managing, and deploying containerized applications (Docker and Podman).
It is the successor to the original Docker extension (`ms-azuretools.vscode-docker`) and is
maintained by the Azure Tools team. Use these instructions when writing code, reviewing pull
requests, and answering questions about this repository.

## Tech stack & project layout

- **Language:** TypeScript, `strict` mode. `module`/`target` = `es2022`, `moduleResolution: bundler`.
  Note that `strictNullChecks`, `noImplicitAny`, and `noImplicitOverride` are currently disabled
  (with TODOs in `tsconfig.json`) — do not rely on them, but do not knowingly introduce new
  null/`any` problems either.
- **Bundler:** esbuild (`esbuild.mjs`). Type-checking is a separate step (`tsc --noEmit`).
- **Entry point:** `main.js` → `src/extension.ts` (`activateInternal`).
- **VS Code engine:** `^1.105.0`. Use the Node version in `.nvmrc`.
- **Key source areas** under `src/`: `commands/`, `tree/`, `runtimes/`, `debugging/`, `tasks/`,
  `scaffolding/`, `telemetry/`, `copilot/` (the extension's own LM tools), `utils/`, and `test/`.
- **Shared platform packages** (prefer these over hand-rolling equivalents):
  - `@microsoft/vscode-azext-utils` — `IActionContext`, `AzureWizard`, `registerCommand`,
    `callWithTelemetryAndErrorHandling`, `UserCancelledError`, `context.ui.*` prompts.
  - `@microsoft/vscode-processutils` — locating executables (`which`) and building command lines
    with correct quoting. Do not reimplement PATH/PATHEXT lookup or manual shell quoting.
  - `@microsoft/vscode-container-client` — the container runtime client (`ext.runWithDefaults`).
  - `@microsoft/vscode-docker-registries` / `@microsoft/vscode-docker-extensibility` — registry
    data providers and the canonical **image-name parser**. Reuse the parser instead of writing new
    image-reference parsing.
  - `@microsoft/vscode-azext-azureauth` / `-azureutils` — Azure auth and resource helpers.

## Build, lint, and test

Run these before proposing that a change is complete; CI (`.github/workflows/main.yml`) runs the
same lint/build/test via the shared `microsoft/vscode-azuretools` workflow.

```bash
npm install
npm run build      # esbuild bundle + tsc --noEmit type check
npm run lint       # eslint --max-warnings 0  (zero warnings allowed)
npm test           # vscode-test (mocha: suite()/test() with node assert)
```

- Lint uses `@microsoft/vscode-azext-eng/eslint` plus a `lazyImportRuleConfig`. **Warnings fail
  the build** (`--max-warnings 0`), so treat lint warnings as errors.
- Tests live in `src/test/**`, use Mocha's `suite()`/`test()` and Node's `assert`, and unit-test
  files are named `*.test.ts`. Prefer pure unit tests that don't require a running container engine.

## Coding conventions

- **License header:** every `.ts` source file begins with the standard MIT header block:
  ```ts
  /*---------------------------------------------------------------------------------------------
   *  Copyright (c) Microsoft Corporation. All rights reserved.
   *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
   *--------------------------------------------------------------------------------------------*/
  ```
- **Localization:** all user-facing strings go through `vscode.l10n.t(...)`. Contributed strings in
  `package.json` use `%key%` placeholders resolved in `package.nls.json`. Never concatenate
  user-facing sentences; use `l10n.t` positional args (`{0}`, `{1}`) instead.
- **Commands:** implement as `async function name(context: IActionContext, ...args)` and register
  through the wrappers in `src/commands/registerCommands.ts` (`registerCommand`,
  `registerLocalCommand`, `registerWorkspaceCommand`). These wrap telemetry and error handling —
  do **not** call `vscode.commands.registerCommand` directly for user commands.
- **Cancellation & prompts:** use `context.ui.showQuickPick` / `showInputBox` / `showWarningMessage`
  for interactive prompts; they throw `UserCancelledError` on cancel, so there's no need to check
  for an "undefined/cancelled" result. Throw `UserCancelledError` for user-initiated exits rather
  than surfacing them as failures.
- **Multi-step flows:** model gather/prompt/execute sequences as an `AzureWizard` with prompt and
  execute steps (each with `shouldPrompt` / `shouldExecute`) rather than long imperative functions.
- **Process execution:** pass arguments as an array, not a single concatenated command-line string;
  use the command-line builders in `@microsoft/vscode-processutils` when a string is unavoidable.
- **Shared state:** cross-cutting singletons live on the `ext` namespace (`src/extensionVariables.ts`).
  Run container commands via `ext.runWithDefaults` / `ext.streamWithDefaults`.
- **Fire-and-forget:** prefix intentionally un-awaited promises with `void` (matching existing code)
  — but only when the result and any rejection genuinely don't matter (see review rules below).
- **Lazy imports:** heavy/optional packages (e.g. `@azure/*`, `handlebars`, `tar`,
  `vscode-languageclient*`, `@microsoft/vscode-azext-azure*`) must be imported lazily through the
  `src/utils/lazyPackages.ts` pattern. This is enforced by ESLint's `lazyImportRuleConfig`; don't
  add static top-level imports of those packages.
- **ASCII punctuation:** use three literal dots `...`, not the single-character ellipsis `…`, in
  strings and comments.
- **Formatting:** there is no auto-formatter and quote style is not perfectly consistent across the
  codebase. Match the surrounding file's existing style and avoid noisy formatting-only diffs.
- **Soft dependencies on other extensions** (invoking their commands via
  `vscode.commands.executeCommand`, e.g. deploying via the Azure App Service / Container Apps
  extensions) are an accepted, established pattern here.

## Code review standards

When reviewing pull requests, focus on high-signal issues. Every item below reflects feedback that
has actually recurred on this repository's PRs. Do **not** nitpick style, formatting, or subjective
preferences; the priority is correctness, safety, cross-platform behavior, and reuse.

### Correctness & robustness (highest priority)

- **No blocking I/O on the extension host.** Flag synchronous file reads/parsing of
  potentially large inputs (e.g. reading and `JSON.parse`-ing a whole blob). Require async I/O and a
  size guard (reuse an existing limit setting such as `containers.oci.jsonDetectionMaxSizeMB` where
  appropriate) so the UI can't freeze.
- **Falsy-coercion bugs.** Reject `value || fallback` and `!!value` patterns that mishandle
  legitimate `0` or `''`. Example: `size || null` turns a real `size: 0` into `null`; a
  `!!requestOptions.body` guard skips valid empty bodies. Require explicit checks
  (`typeof x === 'number'`, `x !== undefined`, `x != null`).
- **Null returns from libraries.** `semver.coerce(...)` can return `null`; passing that into
  `semver.gte`/`lt` throws. Guard the result before using it.
- **semver precedence.** `semver.coerce` strips prerelease/build metadata (e.g. `0.27.0-beta.1` →
  `0.27.0`), which can wrongly satisfy a minimum-version check. Use `semver.parse`/`valid`/`clean`
  when prerelease ordering matters, falling back to `coerce` only if parsing fails.
- **Shared/aliased mutable state.** A shallow object clone still shares nested objects. Mutating
  `options.headers` (or other nested fields) after a shallow spread can leak `Authorization` or
  other data into shared defaults and subsequent requests. Require cloning nested objects before
  mutation, and guard/initialize optional fields (e.g. `headers`) before indexing into them.
- **Unhandled promise rejections.** Fire-and-forget calls (e.g. `void executeCommand(...)`) that can
  reject on missing/failed commands must attach a rejection handler or be `await`ed in a
  `try/catch`, and surface an actionable error. Don't hide failures.
- **Cross-platform / Windows correctness.** Check executable resolution (PATHEXT and already-suffixed
  names like `oras.exe`), path separators, and case sensitivity. Ensure target directories exist
  (`fs.mkdir(..., { recursive: true })`) before writing into them.
- **VS Code API semantics.** Ranges are end-exclusive — use `position.character < end`, not `<=`.
  Scope `MarkdownString.isTrusted` to the specific command(s) needed rather than blanket `true`.
  Prefer awaiting activation/registration where correctness depends on ordering.
- **Consistency of derived values.** Fields derived from different sources must agree — e.g. a
  `repositoryName` taken from a tree label must match the normalized/lowercased image name used
  elsewhere. Derive related values from the same normalized source.

### Types

- Prefer fully-typed contracts over `Partial<T>` when required fields must be present before a call;
  `Partial` removes compile-time enforcement and makes refactors error-prone.
- Understand `satisfies` (asserts the value is *narrower* than a type) vs `as` (asserts it is
  *wider*/compatible). Don't suggest `satisfies` where an `as` widening is actually required.

### Reuse & architecture

- Prefer existing helpers and platform packages over new implementations: `which` and command-line
  building from `@microsoft/vscode-processutils`; the image-name parser from
  `@microsoft/vscode-docker-extensibility`; `AzureWizard` and task/`executeAsTask` helpers from the
  azext packages.
- Flag dead code and duplicated flows (e.g. two near-identical install/prompt helpers). Recommend
  extracting a shared helper so the paths can't drift.
- Ensure new user commands go through the extension's command-registration + telemetry wrappers.

### Documentation & user-facing claims

- If a setting description, `package.nls.json` string, or README claims a behavior (e.g.
  `${workspaceFolder}` substitution), verify the code actually implements it. Otherwise require the
  claim be removed or the behavior implemented — and keep README and `package.nls.json` in sync.
- User-facing strings must be localized via `l10n.t`.

### Tests

- Behavior changes should come with unit tests (or extend existing ones) under `src/test/**`.
  Example: when changing HTTP request construction, add a test that mocks `globalThis.fetch` and
  asserts the resulting `RequestInit`. Keep tests engine-independent where possible.

### Files that must NOT be hand-edited or reviewed line-by-line

These are generated or maintainer-curated. Do not suggest source-level edits to them, and do not
leave line-by-line review comments on their diffs:

- **`NOTICE.html`** — generated third-party notices. Never hand-edit. If notices look wrong
  (placeholders, incorrect/added/missing licenses vs. `package-lock.json`), the fix is to
  regenerate from authoritative sources, not to patch the HTML.
- **`package-lock.json`** — generated by npm. Never hand-edit; don't comment on individual entries.
- **`CHANGELOG.md`** — curated by maintainers. Do not auto-generate or edit changelog entries in
  contributor PRs unless explicitly asked; leave curation to the maintainers.

### Release-process notes

- Version bumps (`package.json` / `package-lock.json`), `CHANGELOG.md` curation, and `NOTICE.html`
  regeneration are part of the maintainers' release process. Ordinary feature/bugfix PRs generally
  should not touch these.
- The `version` must increase monotonically across channels (including pre-releases). Flag any
  version **decrease** (e.g. `2.4.9-alpha` → `2.4.5`) — marketplaces and upgrade ordering reject it.
