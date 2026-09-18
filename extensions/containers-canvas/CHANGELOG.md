# Changelog

All notable changes to this plugin are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and
this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] — 2026-09-15

First release. Packaged as an Agent Plugins 1.0 plugin that ships a Copilot
canvas extension under `com.github.copilot/extensions/`.

### Added

- **Containers and images list** — sortable, filterable, with lifecycle
  controls (start, stop, restart, kill, pause, unpause, remove).
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
- Agent actions for all of the above, so Copilot can drive the panel and the
  user sees everything it does.

### Security

- Requests from web pages are refused. A foreign `Origin` or `Sec-Fetch-Site`
  is rejected on every route, `/rpc` requires `application/json` so a
  cross-origin request must be preflighted, and the terminal WebSocket is
  checked at the upgrade. Local processes are not authenticated: one that can
  reach the panel's port can generally reach the container runtime directly.
- `docker run` refuses to bind-mount drive roots, system directories or the
  runtime socket.
- Running a command in a privileged container, or one mounting the runtime
  socket, requires an explicit acknowledgement, because such a container is
  effectively the host.
- Bulk pruning is not exposed, to the agent or the panel.

### Known limitations

- Podman is detected when Docker is absent and the basics work, but it is not
  supported: several command outputs are parsed differently, and image
  provenance has no Podman equivalent.
- Only tested on Windows.
- Compose containers managed by Docker Desktop report empty labels, so an
  explanation handed to Copilot can say `Labels: {}`.
- Files copied out of a container accumulate in `.copilot-containers/` in the
  session working directory and are not cleaned up automatically.
