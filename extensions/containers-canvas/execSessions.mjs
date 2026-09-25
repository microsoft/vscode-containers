/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Interactive `docker exec` sessions.
//
// SECURITY BOUNDARY -- read this before changing anything here.
//
// Every other operation in this canvas builds a fixed argv from validated
// fields, so nothing the user types can become a command. This file is the
// deliberate exception: an interactive shell *is* arbitrary command execution,
// and pretending otherwise by filtering keystrokes would give a false sense of
// safety while breaking legitimate use.
//
// What is still enforced:
//   - the target must resolve to a container in the loaded list
//   - the container must be running
//   - the shell is chosen from a fixed candidate list, never from user input
//   - argv is fixed: exec -it <id> <shell>. Keystrokes go to the process's
//     stdin, never to a command line
//   - a session dies with its socket, and every session is killed on dispose
//
// What this does NOT contain:
//   A shell inside a container is only as isolated as the container. A
//   privileged container, or one with the docker socket mounted, is equivalent
//   to host access -- `buildx_buildkit_desktop-linux` on this machine runs
//   privileged. That is a property of the container, not of this code.
//
//   The session still opens: a person who chose that container and asked for a
//   shell in it has a legitimate reason, and refusing would break real use.
//   What the panel must not do is imply a sandbox that does not exist, so the
//   server computes `containerHostEscapeRisks` for the target and sends them
//   with the `ready` frame, and TerminalView renders them as a warning above
//   the terminal.
//
//   This is deliberately weaker than `execCommand`, which refuses outright
//   unless the caller sets `acknowledgeHostAccess`. That path is driven by the
//   agent, which may not know what it is asking for; this one is driven by a
//   person who already picked the container.

/*
 * node-pty is loaded lazily and treated as optional.
 *
 * It is the only native dependency in this package, and it is only needed for
 * the interactive terminal. Requiring it at import time would make the whole
 * canvas fail to start on any platform where the prebuild is missing -- losing
 * the container list, logs, stats and everything else over one optional view.
 *
 * So it is resolved on first use, and its absence is reported as "this feature
 * needs an extra install", not as a broken extension.
 */
let ptyModule;
let ptyError = null;

async function loadPty() {
    if (ptyModule) return ptyModule;
    if (ptyError) throw ptyError;
    try {
        ptyModule = await import("@lydell/node-pty");
        return ptyModule;
    } catch (error) {
        ptyError = new Error(
            "The interactive terminal needs the optional native package @lydell/node-pty, which is not installed. " +
            "Run `npm install @lydell/node-pty` in the extension directory to enable it. " +
            "Everything else in this canvas, including running one-off commands, works without it.",
        );
        ptyError.code = "PTY_UNAVAILABLE";
        ptyError.cause = error;
        throw ptyError;
    }
}

/** Whether an interactive terminal can be offered at all. */
export async function ptyAvailable() {
    try {
        await loadPty();
        return true;
    } catch {
        return false;
    }
}

/**
 * Shells to try, in order. A distroless image has none of these, which is
 * reported as such rather than as a generic failure.
 */
const SHELL_CANDIDATES = ["/bin/bash", "/bin/sh", "/bin/ash", "/busybox/sh"];

const MAX_SESSIONS = 8;

/**
 * Does this container have a usable shell, and which one?
 *
 * Probed with a non-interactive exec before spawning the PTY so a distroless
 * image produces an explanation instead of a terminal that dies instantly.
 */
export async function detectShell(runtimeBin, containerId) {
    const { execFile } = await import("node:child_process");
    for (const shell of SHELL_CANDIDATES) {
        const ok = await new Promise((resolve) => {
            execFile(
                runtimeBin,
                ["exec", containerId, shell, "-c", "exit 0"],
                { timeout: 10_000, windowsHide: true },
                (error) => resolve(!error),
            );
        });
        if (ok) return shell;
    }
    return null;
}

/**
 * @param runtimeBin      docker/podman binary.
 * @param loadPtyModule   Seam for tests. Defaults to the real lazy loader; the
 *                        guard tests substitute a fake so they can exercise the
 *                        capacity and disposal races without spawning shells.
 */
export function createExecSessions({ runtimeBin, loadPtyModule = loadPty }) {
    const sessions = new Map();
    // Starts that passed the capacity check but have not spawned yet. Shell
    // detection and the node-pty import are both awaited before a session is
    // recorded, so counting only `sessions` let concurrent sockets each see
    // room and spawn, overshooting the cap.
    let starting = 0;
    // Set once the panel closes. A start already past the check would otherwise
    // spawn a PTY after teardown, with nothing left to kill it.
    let disposed = false;
    // Disambiguates session ids; see the collision note where ids are minted.
    let nextId = 0;

    /** @throws if the panel closed while this start was awaiting something. */
    const assertLive = () => {
        if (disposed) throw new Error("The panel closed before the terminal finished starting.");
    };

    return {
        /**
         * Start a shell. `onData` receives raw terminal output including ANSI
         * escapes -- xterm.js renders them, so nothing is stripped here.
         */
        async start({ containerId, shell, cols = 80, rows = 24, onData, onExit }) {
            assertLive();
            if (sessions.size + starting >= MAX_SESSIONS) {
                throw new Error(`Too many terminal sessions open (${MAX_SESSIONS}). Close one and try again.`);
            }

            // Reserved before the first await, released in `finally`, so the
            // capacity check above accounts for starts still in flight.
            starting += 1;
            try {
                const chosen = shell ?? (await detectShell(runtimeBin, containerId));
                if (!chosen) {
                    throw new Error(
                        "This container has no shell. Distroless and chiseled images ship without one, so they cannot be exec'd into. Use the file browser to inspect it instead.",
                    );
                }
                assertLive();

                // -i -t needs a real terminal on this side, which is why this uses
                // node-pty rather than child_process: `docker exec -it` refuses a
                // piped stdin with "the input device is not a TTY", and without a
                // TTY there is no prompt, no echo and no line editing.
                const { spawn } = await loadPtyModule();
                assertLive();

                const proc = spawn(runtimeBin, ["exec", "-it", containerId, chosen], {
                    name: "xterm-256color",
                    cols,
                    rows,
                    windowsHide: true,
                });

                // Disposal can land between the last check and here; the process
                // exists by now, so it has to be killed rather than refused.
                if (disposed) {
                    try { proc.kill(); } catch { /* already gone */ }
                    assertLive();
                }

                // Date.now() alone collides: two terminals opened on the same
                // container inside one millisecond produced the same key, and
                // the second `set` evicted the first from the map -- leaving a
                // live PTY that nothing could kill. The counter makes it unique.
                const id = `${containerId.slice(0, 12)}-${Date.now().toString(36)}-${(nextId += 1).toString(36)}`;
                const session = { id, proc, containerId, shell: chosen };
                sessions.set(id, session);

                proc.onData((chunk) => onData?.(chunk));
                proc.onExit(({ exitCode }) => {
                    sessions.delete(id);
                    onExit?.(exitCode);
                });

                return { id, shell: chosen };
            } finally {
                starting -= 1;
            }
        },

        write(id, data) {
            sessions.get(id)?.proc.write(data);
        },

        resize(id, cols, rows) {
            const session = sessions.get(id);
            if (!session) return;
            try {
                session.proc.resize(Math.max(2, cols | 0), Math.max(1, rows | 0));
            } catch {
                // A process that exited between the resize and here is not an error.
            }
        },

        kill(id) {
            const session = sessions.get(id);
            if (!session) return;
            sessions.delete(id);
            try { session.proc.kill(); } catch { /* already gone */ }
        },

        /**
         * Every session dies with the panel. A stray shell is a leaked process.
         *
         * Also latches `disposed`, so a start still awaiting shell detection or
         * the node-pty import refuses rather than spawning into a closed panel.
         */
        disposeAll() {
            disposed = true;
            for (const [id] of sessions) this.kill(id);
        },

        get size() {
            return sessions.size;
        },

        /** Sessions running plus starts in flight, which is what the cap counts. */
        get reserved() {
            return sessions.size + starting;
        },
    };
}
