# Constraints and why they exist

Required reading before changing the build, the packaging layout, the shipped
`package.json`, or anything under `bundle/`.

Most of the rules in this package look arbitrary until you know which failure
produced them. Each one below names its incident and the commit that fixed it,
so it can be argued with rather than obeyed. If a constraint no longer applies —
the host changes, a limit is lifted — check it and remove it.

## The portability contract

> An installed plugin folder must run with **no build step**, **no `npm install`**,
> **no repository-root resolution**, and **no assumption about the working
> directory**. Every runtime import must resolve from files inside the plugin
> folder or from the host SDK.

This one sentence generates most of what follows. A Copilot plugin is installed
straight from a git ref and executed as-is: there is no install hook, no
compile, and no `node_modules` unless the user creates one. Whatever is
committed is what runs.

Two deliberate exceptions, both external to the bundle:

- `@github/copilot-sdk/extension` is provided by the host.
- `@lydell/node-pty` is optional and user-installed, and only the terminal
  needs it. Its absence is reported as "this feature needs an extra install",
  never as a broken extension.

## Earned constraints

### The shipped `package.json` must be installable by npm

`"esbuild": "catalog:"` is valid pnpm and meaningless to npm. The README asks
users to run `npm install @lydell/node-pty` in the plugin root for the terminal,
so anyone who followed it got:

```
npm error code EUNSUPPORTEDPROTOCOL
npm error Unsupported URL Type "catalog:": catalog:
```

`--omit=dev` does **not** avoid this: npm parses every dependency field before
deciding what to install, so a devDependency it will never install still breaks
the command. Checking only runtime dependencies would have missed the real case.

*Enforced by `scripts/verifyManifest.mjs`, which fails the build. Fixed in `b0ca1fb9`.*

### Build output must not be called `dist`

The extension packaging flow drops a directory named `dist` as regenerable build
output. For this package that is the only thing that runs, so the extension
installed and then failed to load with `Cannot find module .../dist/host.mjs`.

Confirmed by sharing a probe extension with three subdirectories: `assets/nested/`
and `bundle/` both survived, `dist/` did not. Nested paths are fine; the name is
the problem.

*Fixed in `556eb6d0`. Not enforced by a check — the build writes to `bundle/`
directly, so changing it takes a deliberate edit.*

### No shipped file may exceed 1,000,000 bytes

The installer rejects larger files:

```
File `bundle/webview/main.js` is too large (1348568 bytes > 1000000 byte limit)
```

Earlier the same limit dropped a file silently, producing an extension that
installed and then could not load. The webview is code-split so no emitted file
approaches the ceiling; the terminal's xterm dependency (337 KB, the largest
single dependency) stays out of first paint as a side effect.

**Check `pnpm build` output sizes before folding a lazy view back into the main
entry point.**

*Enforced by `build.mjs`, which fails the build and names the offenders. Fixed in `2a1983e3`.*

### Generated files are committed, so they can go stale silently

`bundle/` and `NOTICE.html` are committed because installs have no build step.
That makes staleness invisible: edit a source file, skip the rebuild, and every
gate stays green — unit tests pass because they import `src/`, lint passes, and
`git status` shows only the source as modified. Users installing from that
commit run the previous bundle.

CI does not help on its own: it rebuilds into its own workspace and never
compares the result with what was committed.

*Enforced by `scripts/verifyBundle.mjs`, wired to the `package` script because
the shared CI template runs it directly after `build`. Fixed in `01fe832b`.*

### The build must start from an empty `bundle/`

Chunk filenames carry a content hash, so editing a view emits a new file and
leaves the previous one behind. Because the bundle is committed, every orphan
ships to users and stays in the repository. A change to the terminal produced a
second `TerminalView` chunk beside the 341 KB one it replaced.

*Fixed in `cb2fd8cc`, found by the drift check above within an hour of adding it.*

### `bundle/` and `NOTICE.html` must not be line-ending normalised

esbuild writes LF. With `core.autocrlf=true`, a checkout rewrote the bundle as
CRLF and the next rebuild reported the entire 2 MB bundle as modified.
`NOTICE.html` additionally embeds third-party licence text verbatim, so
normalising it would alter quoted licences.

*Enforced by `-text` in the repository `.gitattributes`. Verified by a
checkout round trip producing byte-identical files.*

### `typescript` is pinned even though nothing here is TypeScript

`@trpc/server` declares a required peer of `typescript >=5.7.2`. Without an
explicit version, pnpm satisfies it with the TypeScript 7 the repository root
installs under the `@typescript/native` alias. That compiler has no API, so
typescript-eslint silently loses type information and `pnpm -r lint` fails
across the **whole repository**, not just this package.

*Removing it re-breaks linting for every package. See the note in
`pnpm-workspace.yaml`.*

### Install from a copy, not from the working tree

`copilot plugin install <path>` fails with `Access is denied. (os error 5)` when
the path is inside a git checkout. Copy the folder out first. A plain
`npm install` in the plugin root also pulls the 13 build-time devDependencies —
measured at 104 packages against 2 with `--omit=dev`.

## A note on claims in comments

Two comments in this package asserted safeguards that did not exist:

- `execSessions.mjs` said the UI warned about privileged containers. The
  detection existed and was well covered by tests, and the view never called it
  — the safeguard was built, tested, and wired at one end only. Fixed in
  `cb2fd8cc`, where the server now sends the risks with the `ready` frame.
- `Detail` was passed an `onExec` handler it never called, so the Commands view
  the README documents was reachable only through an agent deep-link. Found by
  ESLint in `029e56ff`.

Both were code wired at one end only, and neither was visible to a unit test. A
third near-miss: the CORP header comment in `server.mjs` originally explained
why `same-origin` would break the framed panel. Testing it showed the panel
renders fine, so the stricter value shipped and the comment now records what was
verified.

If you write a comment claiming the code does something protective, check that
it does.

Both were found by tools that read the code rather than run it — one by review,
one by ESLint. Neither would have been found by the unit tests, which is what
`scripts/verifyPanel.mjs` exists for: it is the only check that renders the
panel and clicks things. When changing a view, run `pnpm verify:panel` as well
as the unit tests.

## The third-party notice

`NOTICE.html` is generated by the build from esbuild's metafiles and covers the
57 packages that contribute bytes to `bundle/`. It is regenerated on every build
and checked by the drift check, so it cannot quietly fall behind what ships.

The rest of this repository maintains its root `NOTICE.html` by hand, updated in
the release commit alongside the version and changelog. Generating ours is a
deliberate difference, not a gap: this package bundles a different dependency set
from the VS Code extension, and deriving it from the bytes actually emitted is
what keeps it honest as dependencies change.

It still deserves the same human read at release that any notice gets. The one
thing to look at specifically is the override below.

### One licence is supplied by override

`@fluentui/react-icons` declares MIT and publishes no licence file, so
`scripts/generateNotice.mjs` supplies the text from `LICENCE_OVERRIDES`. That
text was fetched from the package's own repository and compared, not inferred.

It is worth knowing how the first version of that entry was wrong: it used the
licence `@fluentui/react-components` ships, on the reasonable-sounding assumption
that a sibling package from the same publisher carries the same terms. It does
not — that licence adds a clause about fonts and icon assets which upstream does
not have. The entry looked right, cited a real source, and was wrong. Any future
override deserves the same suspicion.
