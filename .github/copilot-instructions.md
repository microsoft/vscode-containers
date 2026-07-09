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
- **Process execution:** pass arguments as an array, not a single concatenated command-line string.
  Build command lines with the `composeArgs` / `withArg` / `withNamedArg` / `withFlagArg` helpers from
  `@microsoft/vscode-container-client` (and follow existing domain arg-builder methods like
  `withDockerBuildArg` when adding new ones) rather than string concatenation. Reuse the existing
  `parseDockerLikeImageName` for image-name parsing instead of writing new parsing.
- **Parsing external tool output:** validate output from external commands (e.g. `docker info`,
  MSBuild `getProperty`) with a `zod` schema following the existing record-validation patterns, rather
  than casting raw JSON. Remember MSBuild returns booleans as the strings `"true"`/`"false"` (use
  `z.stringbool()`), so don't coerce them with `!!` or a bare truthiness check.
- **Overrides & polymorphism:** mark overriding methods with `override`, call `super.method(...)` from
  overrides that extend base behavior, and prefer subclass polymorphism over `if (isSomeVariant)`
  type-conditional branches in a base class.
- **Visibility:** don't `export` functions, constants, or types that are only used within their own
  file. File-level constants use PascalCase.
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

### Review scope & avoiding false positives

- **Verify before flagging.** Confirm a claim against the actual API/types before raising it. Library
  APIs used here are real even if unfamiliar (e.g. `z.stringbool()` exists in the installed Zod
  version) — don't assert a method "doesn't exist" or "is deprecated" without checking the pinned
  version. A confidently wrong comment is worse than none.
- **Don't repeat a rejected point.** If a maintainer has explained why something is intentional, don't
  restate the same objection.
- **Respect intentional decisions.** Deliberate `TODO:` markers, by-design pre-release/alpha
  dependencies, and narrow type-assertion workarounds for known upstream type inconsistencies (e.g.
  `as never` around the CJS/ESM MCP SDK types, where the alternative is a worse `@ts-ignore`) are
  accepted here. Flag them only with a concrete, correct problem.
- **Keep style opinions optional.** The maintainers frequently say "keep whichever you prefer." Phrase
  genuinely subjective suggestions as optional nits, and don't block on them.
- **Keep diffs focused.** Call out unrelated whitespace, import-reordering, or editor-artifact changes
  (e.g. a stray `.vscode/extensions/...` entry) and ask that they be reverted. Prefer fixing the root
  cause of an ESLint warning (add `void`, correct the types) and removing the suppression over adding
  new `eslint-disable` comments; flag leftover commented-out code.

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
- **Locale-independent casing.** For machine/protocol values (OS names, architectures, plugin names,
  registry hosts, image references) use `toLowerCase()` / `toUpperCase()`, never the locale-aware
  `toLocaleLowerCase()` / `toLocaleUpperCase()` — locale casing (e.g. the Turkish dotless "ı") can
  corrupt these comparisons.
- **Handle every case.** When switching on a closed set (e.g. `os.arch()` values, a discriminated
  union, a platform enum), handle all members; normalize case before the switch so the logic is
  reusable. Don't silently fall through on an unmapped value.
- **Concurrency-safe caching.** Cache per-operation derived state in local variables on the stack, not
  on shared class members. Multiple debug sessions (e.g. compound launch configurations) reuse the
  same helper instance, so an instance field computed for one run can leak into another. Conversely,
  VS Code configuration lookups are cheap (~tens of microseconds) — read settings on demand instead of
  caching them behind change listeners.
- **Stream lifecycle.** When writing a stream to a file (e.g. building a tar archive) before consuming
  it, await the stream's `finish`/`close` before reading/uploading the file, or you may act on a
  partially written file.
- **Array membership.** Use `array.includes(x)` or a `Set`'s `.has(x)`, not the `x in array` operator
  (which tests indices/property names, not values).

### Types

- Prefer fully-typed contracts over `Partial<T>` when required fields must be present before a call;
  `Partial` removes compile-time enforcement and makes refactors error-prone.
- Understand `satisfies` (asserts the value is *narrower* than a type) vs `as` (asserts it is
  *wider*/compatible). Don't suggest `satisfies` where an `as` widening is actually required.
- Prefer precise/narrow types over `string` where the set of values is known — e.g. return
  `'amd64' | '386' | 'arm64' | ...` so callers get IntelliSense and exhaustiveness. Add `| string`
  only to *intentionally* allow unknown values. Define shared types before the code that uses them.

### Naming & constants

- Follow the naming conventions already used for parallel concepts (e.g. a new command mirrors the
  existing `XForYCommand` / `XForYCommandOptions` pair; a new arg builder mirrors `withDockerBuildArg`).
- Don't name a class `*Helper` unless it implements the `*Helper` interface. Prefer pure exported
  functions in a `*Utils` module over a stateless class. Name methods for what they do
  (`getConfiguredLabelGroup`, not `getLabel`, when the value is looked up from settings).
- Pull reused string literals and regexes into top-level constants defined with the others, and
  reference existing constants (e.g. `ext.dockerHubRegistryDataProvider.label`) instead of hard-coding
  duplicate strings like `'Docker Hub'`.

### Reuse & architecture

- Prefer existing helpers and platform packages over new implementations: `which` and command-line
  building from `@microsoft/vscode-processutils`; the image-name parser from
  `@microsoft/vscode-docker-extensibility`; `AzureWizard` and task/`executeAsTask` helpers from the
  azext packages.
- Flag dead code and duplicated flows (e.g. two near-identical install/prompt helpers). Recommend
  extracting a shared helper so the paths can't drift.
- Ensure new user commands go through the extension's command-registration + telemetry wrappers.
- **Code locality / coupling.** Keep domain-specific helpers near their domain (e.g. Docker-specific
  helpers under `runtimes/docker/utils`, task code under `src/tasks`) rather than in generic
  `src/utils`. Keep client **contracts** (e.g. `ContainerClient.ts`) self-contained: define the types
  the contract exposes in the contract file instead of importing them from a client implementation —
  duplicate a small type if needed rather than coupling the contract to an implementation.

### Extension activation & performance

- Don't slow extension activation. Push non-critical diagnostics/background work off the activation
  path and `void` it rather than awaiting.
- Check the cheap condition before the expensive one — e.g. read a boolean setting before querying the
  Docker context (which can take ~a second and talks to the engine).

### package.json contributions & settings

- Omit a setting's `"default"` when `undefined` is a meaningful "user hasn't chosen" sentinel (it's
  still falsy but distinguishable from an explicit value).
- Add settings that affect command execution to the `restrictedConfigurations` list so their
  workspace-local values are ignored in untrusted workspaces.
- When a command exists both on a tree item and in the command palette, hide the tree-item variant
  from the palette (`"when": "never"` under `menus.commandPalette`) and reuse the existing `category`
  so users don't see confusing duplicates.
- Give each contribution its own `package.nls.json` key even when the value duplicates another.
- User-facing terminology: spell terms out ("Software Bill of Materials"); use an acronym ("SBOM",
  all caps) only where space is tight.

### Documentation & user-facing claims

- If a setting description, `package.nls.json` string, or README claims a behavior (e.g.
  `${workspaceFolder}` substitution), verify the code actually implements it. Otherwise require the
  claim be removed or the behavior implemented — and keep README and `package.nls.json` in sync.
- User-facing strings must be localized via `l10n.t`.
- Add a short explanatory comment for non-obvious code (e.g. mapping Node's `mipsel` to Go's `mipsle`,
  or other surprising transformations). Use a JSDoc `@see` tag to point at an external reference when
  one motivates the code.

### Scaffolding

- Don't bake host/platform-specific values into scaffolded output when they reduce portability; infer
  them at runtime instead. When a scaffolded base-image tag is platform-specific, choose one broadly
  compatible with supported OS/runtime versions (e.g. prefer `-ltsc2022` over `-ltsc2025`, which needs
  Windows 11 24H2), and consider which runtime versions the tag actually exists for.

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
- Published marketplace versions must increase monotonically across channels (including
  pre-releases); marketplaces and upgrade ordering reject lower published versions. In-repo
  `package.json` / `package-lock.json` versions may legitimately decrease between releases when not
  publishing, so do not flag an in-repo version decrease by itself.
