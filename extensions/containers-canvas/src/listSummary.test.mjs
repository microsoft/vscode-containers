/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from "node:assert/strict";
import test from "node:test";
import { summariseState } from "./listSummary.mjs";

const healthy = {
    runtime: { bin: "docker", version: "27.0.3", available: true },
    containers: [{ id: "a", name: "web" }],
    images: [{ id: "i", ref: "nginx" }],
    error: null,
    listErrors: { containers: null, images: null },
};

const unreachable = {
    runtime: { bin: "docker", version: "27.0.3", available: false },
    containers: [],
    images: [],
    error: "docker is installed but not reachable.",
    listErrors: { containers: "runtime unreachable", images: "runtime unreachable" },
};

const noRuntime = {
    runtime: null,
    containers: [],
    images: [],
    error: "No container runtime found.",
    listErrors: { containers: "no runtime", images: "no runtime" },
};

// One list can fail while the other succeeds; this is the case most likely to
// be misread, because the successful half looks entirely normal.
const partial = {
    runtime: { bin: "docker", version: "27.0.3", available: true },
    containers: [],
    images: [{ id: "i", ref: "nginx" }],
    error: "containers: exited with code 1",
    listErrors: { containers: "exited with code 1", images: null },
};

test("a healthy host reports real counts", () => {
    const out = summariseState(healthy);
    assert.equal(out.error, null);
    assert.deepEqual(out.counts, { containers: 1, images: 1 });
    assert.equal(out.runtime.available, true);
    assert.equal(out.containers.length, 1);
});

test("a genuinely empty host still reports zero, not unavailable", () => {
    const out = summariseState({ ...healthy, containers: [], images: [] });
    assert.deepEqual(out.counts, { containers: 0, images: 0 });
    assert.deepEqual(out.containers, []);
    assert.equal(out.error, null);
});

test("an unreachable runtime is not reported as an empty inventory", () => {
    const out = summariseState(unreachable);
    assert.equal(out.counts.containers, null, "a failed read must not count as 0");
    assert.equal(out.counts.images, null);
    assert.equal(out.containers.unavailable, true);
    assert.match(out.error, /not reachable/);
    assert.equal(out.runtime.available, false, "availability must reach the agent");
});

test("a missing runtime is not reported as an empty inventory", () => {
    const out = summariseState(noRuntime);
    assert.equal(out.counts.containers, null);
    assert.equal(out.containers.unavailable, true);
    assert.equal(out.runtime, null);
    assert.match(out.error, /No container runtime/);
});

test("a partial failure keeps the list that worked and flags the one that did not", () => {
    const out = summariseState(partial);
    assert.equal(out.counts.containers, null, "the failed list is unavailable");
    assert.equal(out.containers.unavailable, true);
    assert.match(out.containers.reason, /exited with code 1/);
    assert.equal(out.counts.images, 1, "the list that worked is unaffected");
    assert.equal(out.images.length, 1);
});

test("kind still selects which lists come back", () => {
    const containersOnly = summariseState(healthy, { kind: "containers" });
    assert.ok(containersOnly.containers);
    assert.equal(containersOnly.images, undefined);
    assert.equal(containersOnly.counts.images, undefined);

    const imagesOnly = summariseState(healthy, { kind: "images" });
    assert.equal(imagesOnly.containers, undefined);
    assert.ok(imagesOnly.images);
});

test("limit truncates without changing the reported total", () => {
    const many = {
        ...healthy,
        containers: Array.from({ length: 10 }, (_, i) => ({ id: String(i) })),
    };
    const out = summariseState(many, { limit: 3 });
    assert.equal(out.containers.length, 3, "rows are truncated");
    assert.equal(out.counts.containers, 10, "the count is the true total");
});

test("state from an older shape without listErrors still summarises", () => {
    const legacy = { runtime: { bin: "docker", available: true }, containers: [], images: [], error: null };
    const out = summariseState(legacy);
    assert.deepEqual(out.counts, { containers: 0, images: 0 });
});
