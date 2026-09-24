# Changelog

All notable changes to this plugin are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and
this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] — 2026-09-22

First release. Packaged as an Agent Plugins 1.0 plugin that ships a Copilot
canvas extension under `com.github.copilot/extensions/`.

### Added

- **Containers and images list** — sortable, filterable, with lifecycle
  controls (start, stop, restart, pause, unpause, remove). Removing asks for
  confirmation in a dialog that names the container and shows the exact command
  first; a running container is force-removed, and the confirmation says so
  rather than leaving `-f` to be inferred. `kill` remains available to the agent
  through the canvas actions rather than as a button.
- **Logs** — live `docker logs --follow` over a dedicated stream, with
  filtering, adjustable tail, bottom-pinning and a "jump to live" control.
- **Stats** — CPU, memory and network sampled about once a second and drawn as
  sparklines.
- **Files** — browse a container's filesystem and read files out of it using
  `docker cp`, which works on stopped and distroless containers where `exec`
  does not. A file can be copied to the workspace and opened in the Copilot
  editor.
- **Terminal** — an interactive shell backed by a real PTY. Optional; requires
  `@lydell/node-pty`, and reports itself unavailable when that is absent.
- **Commands** — run one-off commands as argv (never a shell string) and keep
  an auditable record of argv, exit status, duration and output.
- **Layers** — an image's layers in build order with the size each added, and
  the Dockerfile instruction that created it.
- **Dockerfile** — the recorded source repository and commit from SLSA
  provenance or OCI labels, alongside a clearly separated reconstruction from
  layer history.
- **Run image** — start a container from an image with validated ports,
  environment, labels, mounts, network, restart policy and resource limits.
- **Pull and tag** images from the panel.
- **Live daemon tracking** — the panel follows `docker events`, so changes made
  anywhere (another terminal, an IDE, a compose run) appear without a refresh.
  A 10-second poll compares containers only and acts as a safety net for what a
  stream cannot report: a dropped connection, a daemon restart, a machine
  resuming from sleep. An idle machine produces no work.
- Agent actions for all of the above, so Copilot can drive the panel and the
  user sees everything it does.
- A **router skill**, so container questions reliably open the panel rather than
  producing pasted command output, and land on the view that answers them.
- A **plugin catalog** (`.github/plugin/marketplace.json`) so the plugin
  installs by name without the deprecated direct-install path.

### Security

- Requests from web pages are refused. A foreign `Origin` or `Sec-Fetch-Site`
  is rejected on every route, `/rpc` requires `application/json` so a
  cross-origin request must be preflighted, and the terminal WebSocket is
  checked at the upgrade. Local processes are not authenticated: one that can
  reach the panel's port can generally reach the container runtime directly.
- Every response carries `X-Content-Type-Options: nosniff` and
  `Cross-Origin-Resource-Policy: same-origin`, including error responses.
  `nosniff` matters most on the routes that echo container output.
- `docker run` refuses to bind-mount drive roots, system directories or the
  runtime socket. Paths containing a `..` segment are refused outright rather
  than resolved, and the deny-list is matched against a separator-collapsed
  form, so `/tmp/../etc` and `//etc` cannot name a blocked directory past a rule
  anchored on `/etc`.
- The image passed to `docker run` is validated before it becomes an argument.
  Docker parses options until its first positional, so an unvalidated image of
  `--privileged` would have been read as a flag.
- Removing a container or image through the agent surface requires
  `acknowledgeDestructive`. It is not a boundary against a caller that means it
  — it is the same standard the privileged-exec acknowledgement sets, so that a
  mistyped or guessed `op` cannot destroy something while every other verb in
  the same list is reversible. The panel supplies it only after its confirmation
  dialog.
- Files extracted from a container are written under a per-container folder, and
  a target that would name its parent (`/..`) is refused rather than resolved.
- Running a command in a privileged container, or one mounting the runtime
  socket, requires an explicit acknowledgement, because such a container is
  effectively the host. `--cap-add ALL` counts as privileged for this purpose.
  Opening an interactive terminal in one is allowed — the
  person chose that container — but the panel says plainly that the shell is not
  isolated from the machine.
- Bulk pruning is not exposed, to the agent or the panel.

### Known limitations

- Podman is detected when Docker is absent and the basics work, but it is not
  supported: several command outputs are parsed differently, and image
  provenance has no Podman equivalent.
- Only tested on Windows.
- Compose containers managed by Docker Desktop report empty labels, so an
  explanation handed to Copilot can say `Labels: {}`.
- Changes made outside the panel appear within a few seconds rather than
  instantly, and a change the event stream misses entirely waits for the next
  10-second poll.
