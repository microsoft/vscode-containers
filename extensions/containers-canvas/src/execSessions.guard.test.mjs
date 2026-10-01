/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from "node:assert/strict";
import test from "node:test";
import { createExecSessions } from "../execSessions.mjs";

/**
 * A PTY that never really spawns. `start` awaits shell detection and the
 * node-pty import before it records a session, and those awaits are exactly
 * where the races live -- so the fake yields the event loop the same way the
 * real loader does, without leaving a `docker exec` behind.
 */
function fakePty() {
    const killed = [];
    const load = async () => {
        // Two turns, matching the real path: dynamic import, then spawn.
        await null;
        await null;
        return {
            spawn: () => ({
                onData() {},
                onExit() {},
                kill() { killed.push(true); },
                write() {},
                resize() {},
            }),
        };
    };
    return { load, killed };
}

const opts = { containerId: "abc123456789", shell: "sh" };

test("concurrent starts cannot exceed the session cap", async () => {
    const pty = fakePty();
    const execs = createExecSessions({ runtimeBin: "docker", loadPtyModule: pty.load });

    // All twelve pass through the check before any of them spawns, which is
    // the condition the old `sessions.size` check could not see.
    const results = await Promise.all(
        Array.from({ length: 12 }, () =>
            execs.start(opts).then(() => "ok", (e) => e.message)),
    );

    const started = results.filter((r) => r === "ok").length;
    assert.equal(execs.size, 8, `expected the cap to hold, got ${execs.size} sessions`);
    assert.equal(started, 8, "exactly the cap should start");
    assert.equal(results.filter((r) => /Too many/.test(r)).length, 4, "the rest are refused");
});

test("a start in flight when the panel closes does not leak a shell", async () => {
    const pty = fakePty();
    const execs = createExecSessions({ runtimeBin: "docker", loadPtyModule: pty.load });

    const inFlight = execs.start(opts).then(() => "started", (e) => e.message);
    execs.disposeAll();

    const outcome = await inFlight;
    assert.match(String(outcome), /closed before/, "the start is refused");
    assert.equal(execs.size, 0, "no session survives disposal");
});

test("a start that spawns before disposal is observed gets killed", async () => {
    const pty = fakePty();
    const execs = createExecSessions({ runtimeBin: "docker", loadPtyModule: pty.load });

    // Dispose after the pty import resolves but in the same tick the process
    // is created, so the post-spawn check is the only thing that can catch it.
    const inFlight = execs.start(opts).then(() => "started", (e) => e.message);
    await null;
    await null;
    execs.disposeAll();

    await inFlight;
    assert.equal(execs.size, 0, "no session survives disposal");
});

test("starts after disposal are refused outright", async () => {
    const pty = fakePty();
    const execs = createExecSessions({ runtimeBin: "docker", loadPtyModule: pty.load });
    execs.disposeAll();
    const outcome = await execs.start(opts).then(() => "started", (e) => e.message);
    assert.match(String(outcome), /closed before/);
});

test("refused starts release their reservation", async () => {
    const pty = fakePty();
    const execs = createExecSessions({ runtimeBin: "docker", loadPtyModule: pty.load });

    await Promise.all(Array.from({ length: 12 }, () => execs.start(opts).catch(() => {})));
    assert.equal(execs.reserved, 8, "in-flight count returns to zero once starts settle");

    execs.disposeAll();
    assert.equal(execs.reserved, 0, "disposal clears everything");
});
