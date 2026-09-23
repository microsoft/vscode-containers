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

import { computeInputDigest } from "./buildInputs.mjs";

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
        assert.equal((await computeInputDigest(a)).digest, (await computeInputDigest(b)).digest);
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
        assert.equal((await computeInputDigest(lf)).digest, (await computeInputDigest(crlf)).digest);
    } finally {
        await rm(lf, { recursive: true, force: true });
        await rm(crlf, { recursive: true, force: true });
    }
});

test("editing a source file moves the digest", async () => {
    const before = await fixture();
    const after = await fixture({ extra: "changed" });
    try {
        assert.notEqual((await computeInputDigest(before)).digest, (await computeInputDigest(after)).digest);
    } finally {
        await rm(before, { recursive: true, force: true });
        await rm(after, { recursive: true, force: true });
    }
});

test("a new source file moves the digest and is counted", async () => {
    const root = await fixture();
    try {
        const first = await computeInputDigest(root);
        assert.equal(first.fileCount, 5);

        await writeFile(join(root, "src", "added.mjs"), "export const c = 3;\n", "utf8");
        const second = await computeInputDigest(root);

        assert.equal(second.fileCount, 6);
        assert.notEqual(first.digest, second.digest);
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});

test("renaming a file moves the digest even when the contents are unchanged", async () => {
    // Paths are hashed alongside contents, so a move is a change. Without this
    // an entry point could be renamed without the bundle being rebuilt.
    const root = await fixture();
    try {
        const before = await computeInputDigest(root);
        await writeFile(join(root, "src", "renamed.mjs"), "export const a = 1;\n// \n", "utf8");
        await rm(join(root, "src", "index.mjs"));
        assert.notEqual(before.digest, (await computeInputDigest(root)).digest);
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});
