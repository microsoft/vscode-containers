/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from "node:assert/strict";
import test from "node:test";

import { inspectManifest, verifyManifest } from "./verifyManifest.mjs";

test("a manifest with ordinary version ranges passes", () => {
    const manifest = {
        dependencies: { react: "^19.0.0" },
        devDependencies: { esbuild: "^0.28.1", typescript: "~5.9.3" },
        optionalDependencies: { "@lydell/node-pty": "^1.2.0-beta.15" },
    };
    assert.deepEqual(inspectManifest(manifest).problems, []);
    assert.doesNotThrow(() => verifyManifest(manifest));
});

test("a catalog: specifier is rejected -- this is the bug that shipped", () => {
    const { problems } = inspectManifest({ devDependencies: { esbuild: "catalog:" } });
    assert.equal(problems.length, 1);
    assert.equal(problems[0].field, "devDependencies");
    assert.equal(problems[0].name, "esbuild");
});

test("devDependencies are checked, because npm parses them even with --omit=dev", () => {
    // Verified against npm: `npm install <pkg> --omit=dev` still fails with
    // EUNSUPPORTEDPROTOCOL when a devDependency uses a pnpm-only protocol, so
    // restricting this check to runtime dependencies would miss the real case.
    assert.throws(() => verifyManifest({ devDependencies: { esbuild: "catalog:" } }), /devDependencies\.esbuild/);
});

test("every workspace-only protocol is rejected", () => {
    for (const spec of ["catalog:", "catalog:default", "workspace:*", "workspace:^1.0.0", "link:../x", "portal:../x", "file:../x"]) {
        const { problems } = inspectManifest({ dependencies: { thing: spec } });
        assert.equal(problems.length, 1, `${spec} should be rejected`);
    }
});

test("all four dependency fields are inspected", () => {
    const manifest = {
        dependencies: { a: "catalog:" },
        devDependencies: { b: "workspace:*" },
        optionalDependencies: { c: "link:../c" },
        peerDependencies: { d: "portal:../d" },
    };
    assert.deepEqual(inspectManifest(manifest).problems.map((p) => p.field).sort(),
        ["dependencies", "devDependencies", "optionalDependencies", "peerDependencies"]);
});

test("a non-string specifier is reported rather than crashing", () => {
    const { problems } = inspectManifest({ dependencies: { a: { version: "1.0.0" } } });
    assert.equal(problems.length, 1);
    assert.match(problems[0].why, /string/);
});

test("missing or empty dependency fields are fine", () => {
    for (const manifest of [{}, { dependencies: null }, { dependencies: {} }, null, undefined]) {
        assert.doesNotThrow(() => verifyManifest(manifest));
    }
});

test("the error names every offender, not just the first", () => {
    assert.throws(
        () => verifyManifest({ dependencies: { a: "catalog:", b: "workspace:*" } }),
        (error) => /dependencies\.a/.test(error.message) && /dependencies\.b/.test(error.message),
    );
});

test("a version range that merely contains a rejected word is allowed", () => {
    // The check is prefix-based on the specifier, not a substring search, so a
    // package or tag whose name embeds one of these words must still pass.
    assert.deepEqual(inspectManifest({ dependencies: { "my-workspace-tools": "^2.0.0", x: ">=1 <2" } }).problems, []);
});
