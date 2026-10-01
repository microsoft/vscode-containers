/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from "node:assert/strict";
import test from "node:test";
import { openPanel } from "../openPanel.mjs";

class FakeCanvasError extends Error {
    constructor(code, message) {
        super(message);
        this.code = code;
    }
}

const web = { id: "c1", kind: "container", name: "web", shortId: "c1shortid" };
const nginx = { id: "i1", kind: "image", ref: "nginx:latest", shortId: "i1shortid" };

function fakeInstance({ state, targets = [web, nginx] } = {}) {
    const broadcasts = [];
    let refreshes = 0;
    return {
        url: "http://127.0.0.1:1234/",
        broadcasts,
        get refreshes() { return refreshes; },
        getState: () => state ?? {
            runtime: { bin: "docker", available: true },
            containers: [{ state: "running" }, { state: "exited" }],
            images: [],
        },
        refresh: async () => {
            refreshes += 1;
            return { runtime: { bin: "docker", available: true }, containers: [], images: [] };
        },
        findTarget: (q) => targets.find((t) => t.name === q || t.ref === q || t.id === q) ?? null,
        broadcast: (f) => broadcasts.push(f),
    };
}

const deps = { CanvasError: FakeCanvasError };

test("no input opens the list without broadcasting a focus", async () => {
    const instance = fakeInstance();
    const out = await openPanel({ input: undefined }, instance, deps);
    assert.equal(instance.broadcasts.length, 0);
    assert.equal(out.title, "Containers");
    assert.equal(out.status, "docker · 1 running");
});

test("a target focuses it and titles the panel", async () => {
    const instance = fakeInstance();
    const out = await openPanel({ input: { target: "web", view: "logs" } }, instance, deps);
    assert.deepEqual(instance.broadcasts[0].view, "logs");
    assert.equal(instance.broadcasts[0].tab, "containers");
    assert.equal(out.title, "Containers · web");
});

test("an image target selects the images tab", async () => {
    const instance = fakeInstance();
    await openPanel({ input: { target: "nginx:latest", view: "layers" } }, instance, deps);
    assert.equal(instance.broadcasts[0].tab, "images");
});

test("an unknown target is an error the agent sees", async () => {
    const instance = fakeInstance();
    await assert.rejects(
        () => openPanel({ input: { target: "nope" } }, instance, deps),
        (e) => e.code === "canvas_target_not_found",
    );
});

test("a container cannot be asked for image-only views", async () => {
    const instance = fakeInstance();
    await assert.rejects(
        () => openPanel({ input: { target: "web", view: "layers" } }, instance, deps),
        (e) => e.code === "canvas_invalid_view",
    );
});

test("an image cannot be asked for container-only views", async () => {
    const instance = fakeInstance();
    await assert.rejects(
        () => openPanel({ input: { target: "nginx:latest", view: "stats" } }, instance, deps),
        (e) => e.code === "canvas_invalid_view" && /resource usage/.test(e.message),
    );
});

test("a per-target view without a target falls back to the list and says so", async () => {
    // The reported case: this used to be dropped in silence, so the agent
    // believed it had opened resource usage.
    const instance = fakeInstance();
    const out = await openPanel({ input: { view: "stats" } }, instance, deps);

    assert.equal(instance.broadcasts.length, 1, "the panel still moves to the list");
    assert.equal(instance.broadcasts[0].view, "list");
    assert.match(out.status, /needs a target/, "the agent is told the view was not applied");
    assert.match(out.status, /stats/);
    assert.equal(out.title, "Containers");
});

test("every per-target view reports the fallback", async () => {
    for (const view of ["logs", "stats", "files", "terminal", "exec", "layers", "dockerfile", "details"]) {
        const instance = fakeInstance();
        const out = await openPanel({ input: { view } }, instance, deps);
        assert.match(out.status, /needs a target/, `${view} should report the fallback`);
    }
});

test("view list and tab still work without a target", async () => {
    const instance = fakeInstance();
    const out = await openPanel({ input: { view: "list" } }, instance, deps);
    assert.equal(instance.broadcasts[0].view, "list");
    assert.ok(!/needs a target/.test(out.status), "an explicit list is not a fallback");

    const other = fakeInstance();
    await openPanel({ input: { tab: "images" } }, other, deps);
    assert.equal(other.broadcasts[0].tab, "images");
});

test("an unreachable runtime is re-checked once, then reported", async () => {
    const instance = fakeInstance({
        state: { runtime: { bin: "docker", available: false }, containers: [], images: [] },
    });
    const out = await openPanel({ input: undefined }, instance, deps);
    assert.equal(instance.refreshes, 1, "reopening re-checks a runtime that was down");
    assert.equal(out.status, "docker · 0 running");
});

test("no runtime at all is reported plainly", async () => {
    const instance = fakeInstance({ state: { runtime: null, containers: [], images: [] } });
    const out = await openPanel({ input: undefined }, instance, deps);
    assert.equal(out.status, "no runtime detected");
});
