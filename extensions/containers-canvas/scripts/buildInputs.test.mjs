/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// The digest replaces a byte comparison that could not survive a change of
// platform, so the properties worth holding it to are the ones that comparison
// lacked: identical input must give an identical answer whatever the checkout
// looks like, and any real source change must move it.

import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { computeInputDigest, ownInputsFrom } from "./buildInputs.mjs";

/** The files every fixture below writes, in the form the build would report. */
const FIXTURE_FILES = [
    "src/index.mjs",
    "src/webview/main.jsx",
    "build.mjs",
    "scripts/generateNotice.mjs",
    "package.json",
];

/** A throwaway package root with the layout `computeInputDigest` expects. */
async function fixture({ eol = "\n", extra = "" } = {}) {
    const root = await mkdtemp(join(tmpdir(), "cc-inputs-"));
    await mkdir(join(root, "src", "webview"), { recursive: true });
    await mkdir(join(root, "scripts"), { recursive: true });

    const write = (path, lines) => writeFile(join(root, path), lines.join(eol), "utf8");
    await write(join("src", "index.mjs"), ["export const a = 1;", `// ${extra}`, ""]);
    await write(join("src", "webview", "main.jsx"), ["export const b = 2;", ""]);
    await write("build.mjs", ["// build", ""]);
    await write(join("scripts", "generateNotice.mjs"), ["// notice", ""]);
    await write("package.json", ['{ "name": "x" }', ""]);
    return root;
}

test("the same source gives the same digest", async () => {
    const a = await fixture();
    const b = await fixture();
    try {
        assert.equal((await computeInputDigest(a, FIXTURE_FILES)).digest, (await computeInputDigest(b, FIXTURE_FILES)).digest);
    } finally {
        await rm(a, { recursive: true, force: true });
        await rm(b, { recursive: true, force: true });
    }
});

test("a CRLF checkout digests the same as an LF one", async () => {
    // The point of the exercise. A Windows checkout with core.autocrlf=true has
    // CRLF in the working tree where CI has LF; hashing raw bytes would fail
    // every CI run for source that is character-for-character identical.
    const lf = await fixture({ eol: "\n" });
    const crlf = await fixture({ eol: "\r\n" });
    try {
        assert.equal((await computeInputDigest(lf, FIXTURE_FILES)).digest, (await computeInputDigest(crlf, FIXTURE_FILES)).digest);
    } finally {
        await rm(lf, { recursive: true, force: true });
        await rm(crlf, { recursive: true, force: true });
    }
});

test("editing a source file moves the digest", async () => {
    const before = await fixture();
    const after = await fixture({ extra: "changed" });
    try {
        assert.notEqual((await computeInputDigest(before, FIXTURE_FILES)).digest, (await computeInputDigest(after, FIXTURE_FILES)).digest);
    } finally {
        await rm(before, { recursive: true, force: true });
        await rm(after, { recursive: true, force: true });
    }
});

test("a file joining the build graph moves the digest and is counted", async () => {
    const root = await fixture();
    try {
        const first = await computeInputDigest(root, FIXTURE_FILES);
        assert.equal(first.fileCount, 5);

        // The list comes from the build, so a file only counts once the build
        // reports compiling it. Writing one on disk is not enough — which is
        // the point: `server.mjs` sat outside the old directory walk and was
        // compiled in anyway.
        await writeFile(join(root, "added.mjs"), "export const c = 3;\n", "utf8");
        assert.equal((await computeInputDigest(root, FIXTURE_FILES)).digest, first.digest);

        const second = await computeInputDigest(root, [...FIXTURE_FILES, "added.mjs"]);
        assert.equal(second.fileCount, 6);
        assert.notEqual(first.digest, second.digest);
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});

test("paths are hashed alongside contents, so a rename is a change", async () => {
    const root = await fixture();
    try {
        const before = await computeInputDigest(root, FIXTURE_FILES);
        await writeFile(join(root, "src", "renamed.mjs"), "export const a = 1;\n// \n", "utf8");
        const renamed = FIXTURE_FILES.map((path) => (path === "src/index.mjs" ? "src/renamed.mjs" : path));
        assert.notEqual(before.digest, (await computeInputDigest(root, renamed)).digest);
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});

test("ownInputsFrom keeps this package's files and drops dependencies", () => {
    // The metafile lists every file esbuild read, most of them in node_modules.
    // Only the ones this repository can edit are worth hashing.
    const inputs = ownInputsFrom([
        { inputs: { "src/index.mjs": {}, "server.mjs": {}, "../../node_modules/.pnpm/x/index.js": {} } },
        { inputs: { "src/webview/main.jsx": {}, "node_modules/react/index.js": {}, "src/index.mjs": {} } },
    ]);
    assert.deepEqual(inputs.sort(), ["server.mjs", "src/index.mjs", "src/webview/main.jsx"]);
});

test("ownInputsFrom copes with a missing or empty metafile", () => {
    assert.deepEqual(ownInputsFrom([]), []);
    assert.deepEqual(ownInputsFrom([undefined, {}, { inputs: {} }]), []);
});
