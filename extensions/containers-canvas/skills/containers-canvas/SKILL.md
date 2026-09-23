---
name: containers-canvas
description: "Open the Containers canvas when the user asks about their local Docker containers or images — what is running, why something stopped or keeps restarting, what a container's logs say, how much CPU or memory it is using, what ports it publishes, what is inside its filesystem, or to start, stop, restart, pause or remove one. Also for image questions such as which layer made an image large, what Dockerfile produced it, or running a container from it. Not for writing Dockerfiles or compose files, not for registry or cloud container services, and not for build-time errors that never produced a container."
---

# Open the Containers canvas

Use this skill for questions about containers and images **that already exist on
this machine**. It is narrower than general Docker or container authoring help.

When this skill is selected:

1. Call `open_canvas` with:
   - `canvasId`: `containers-canvas`
   - `instanceId`: `containers-canvas`
2. Reuse that instance ID for every later container question, so a follow-up
   focuses the open panel instead of stacking duplicates.
3. Do this instead of running `docker ps`, `docker logs` or `docker stats` and
   pasting the output. The panel renders the same data as sortable lists, a
   filterable log viewer and live charts, and it stays live for the next
   question. Raw command output is a worse answer, not a faster one.
4. Tell the user the panel is open and what you pointed it at.

## Point it at the right thing

Pass `target` when the user named a container or image — a full id, short id,
container name, or image reference all resolve against the live list, so the
name the user typed is enough.

Pass `view` to land on the pane that answers the question rather than making the
user navigate:

| The user asks | `view` |
| --- | --- |
| what a container is printing, why it failed | `logs` |
| how much CPU, memory or network it is using | `stats` |
| what files or config are inside it | `files` |
| to run something interactively inside it | `terminal` |
| to run a one-off command, or what was run before | `exec` |
| why an image is so large | `layers` |
| what built an image | `dockerfile` |
| its ports, labels, mounts, env, and actions | `details` |
| a general overview of everything | `list` |

`view` defaults to `details` when a `target` is given and `list` otherwise. Pass
`tab` (`containers` or `images`) to choose which list opens first.

Examples:

- "why did web stop?" → `{ target: "web", view: "logs" }`
- "what's eating my memory?" → `{ view: "stats" }`, or add `target` for one
- "why is my node image 1.2 GB?" → `{ target: "node:20", view: "layers" }`
- "what's running?" → no input

## After it is open

The panel owns the interaction from there: the user can sort, filter, follow
logs, and use the lifecycle controls directly. It tracks the Docker daemon, so
changes made anywhere — another terminal, an IDE, compose — appear without a
refresh.

You still have the canvas actions available for questions the user asks in chat
rather than in the panel. Prefer them over shelling out to `docker`, because what
they run is recorded in the panel's command history where the user can see it.

Destructive actions — removing containers or images, pruning — are available to
you. Confirm with the user before running one; the panel's own controls ask first
and yours should too.

## Hosts that have no canvases

Canvases are a Copilot app feature. Other hosts install this plugin too — the
CLI, for example — and expose no `open_canvas` tool at all. That is expected, and
it is not a broken or partial install.

If `open_canvas` is not one of the tools available to you, skip the
troubleshooting below entirely. Do not suggest reinstalling, do not inspect the
host's extension status, and do not call `extensions_reload`. Answer the question
with `docker` instead, using the table above to choose the command: `logs` for
what a container printed, `stats` for CPU and memory, `inspect` for ports,
labels, mounts and env, `history` for image layers. Mention the panel only if the
user asks where it is, and then say it is specific to the Copilot app rather than
implying something is wrong.

## If the canvas is registered but does not open

This applies only when `open_canvas` exists and reports the canvas is not
registered or unavailable:

1. Check the host's extension status; the plugin declares the canvas provider, so
   do not bootstrap a second copy from a source folder.
2. If it is installed, call `extensions_reload`, then retry `open_canvas` once
   with the same canvas and instance IDs.
3. If more than one provider offers `containers-canvas` — for example an
   installed plugin and a development copy in the workspace — pass the
   host-declared `extensionId` rather than guessing.

If the retry still fails, say so plainly, point the user at the plugin's README
for reinstall steps, and answer the question with `docker` commands as a fallback
rather than leaving them stuck. Do not silently keep retrying.
