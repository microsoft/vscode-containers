/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Tests for the NOTICE generator.
//
// The interesting cases are the ones that would produce a notice that looks fine
// and is wrong: attributing code that was tree-shaken out, missing a package that
// only appears transitively, or silently dropping one whose licence is unreadable.

import assert from "node:assert/strict";
import test from "node:test";
import path from "node:path";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";

import { collectBundledPackages, renderNotice, __internals } from "./generateNotice.mjs";

const { owningPackageDir, homepageOf, licenceNameOf, escapeHtml } = __internals;

/* ------------------------------------------------------------------ *
 * Package resolution
 * ------------------------------------------------------------------ */

test("owningPackageDir finds the package that owns a file", () => {
    assert.equal(
        owningPackageDir(path.join("C:", "repo", "node_modules", "react", "index.js")),
        path.join("C:", "repo", "node_modules", "react"),
    );
});

test("owningPackageDir keeps both segments of a scoped name", () => {
    assert.equal(
        owningPackageDir(path.join("/repo", "node_modules", "@trpc", "server", "dist", "index.js")),
        path.join("/repo", "node_modules", "@trpc", "server"),
    );
});

test("owningPackageDir resolves through pnpm's nested store layout", () => {
    // pnpm puts the real package behind a second node_modules, so taking the
    // first match would yield the version-stamped directory rather than the package.
    const input = path.join("/repo", "node_modules", ".pnpm", "react@19.3.0", "node_modules", "react", "index.js");
    assert.equal(owningPackageDir(input), path.join("/repo", "node_modules", ".pnpm", "react@19.3.0", "node_modules", "react"));
});

test("owningPackageDir returns null for first-party source", () => {
    assert.equal(owningPackageDir(path.join("/repo", "src", "runtime.mjs")), null);
});

/* ------------------------------------------------------------------ *
 * Manifest reading
 * ------------------------------------------------------------------ */

test("licenceNameOf reads every shape npm allows", () => {
    assert.equal(licenceNameOf({ license: "MIT" }), "MIT");
    assert.equal(licenceNameOf({ license: { type: "Apache-2.0" } }), "Apache-2.0");
    assert.equal(licenceNameOf({ licenses: [{ type: "MIT" }, { type: "GPL-3.0" }] }), "MIT OR GPL-3.0");
    assert.equal(licenceNameOf({}), null);
});

test("homepageOf normalises git remotes into links", () => {
    assert.equal(homepageOf({ repository: { url: "git+https://github.com/o/r.git" } }), "https://github.com/o/r");
    assert.equal(homepageOf({ repository: "git://github.com/o/r.git" }), "https://github.com/o/r");
    assert.equal(homepageOf({ homepage: "https://example.com" }), "https://example.com");
    assert.equal(homepageOf({}), null);
});

test("escapeHtml neutralises markup in licence text", () => {
    assert.equal(escapeHtml('<script>"x" & y'), "&lt;script&gt;&quot;x&quot; &amp; y");
});

/* ------------------------------------------------------------------ *
 * Collection, against a real directory tree
 * ------------------------------------------------------------------ */

async function fixture() {
    const root = await mkdtemp(path.join(tmpdir(), "notice-"));
    const add = async (name, { version, license, licenceFile, text }) => {
        const dir = path.join(root, "node_modules", ...name.split("/"));
        await mkdir(dir, { recursive: true });
        await writeFile(path.join(dir, "package.json"), JSON.stringify({ name, version, license }));
        if (licenceFile) await writeFile(path.join(dir, licenceFile), text ?? "LICENCE TEXT");
        return dir;
    };
    await add("shipped", { version: "1.0.0", license: "MIT", licenceFile: "LICENSE", text: "SHIPPED TEXT" });
    await add("treeshaken", { version: "2.0.0", license: "MIT", licenceFile: "LICENSE" });
    await add("nolicence", { version: "3.0.0", license: "MIT" });
    await add("@scope/pkg", { version: "4.0.0", license: "ISC", licenceFile: "LICENSE.md", text: "SCOPED TEXT" });
    return root;
}

const metafileFor = (entries) => ({
    outputs: {
        "dist/out.js": {
            inputs: Object.fromEntries(entries.map(([file, bytes]) => [file, { bytesInOutput: bytes }])),
        },
    },
});

test("collectBundledPackages attributes only what contributed bytes", async () => {
    const root = await fixture();
    try {
        // `treeshaken` was parsed but contributed nothing, which is exactly what
        // importing one component from a barrel does to the rest of the barrel.
        const meta = metafileFor([
            ["node_modules/shipped/index.js", 1200],
            ["node_modules/treeshaken/index.js", 0],
            ["node_modules/@scope/pkg/index.js", 40],
            ["src/main.jsx", 900],
        ]);
        const { packages, missing } = await collectBundledPackages([meta], { cwd: root });
        assert.deepEqual(packages.map((p) => p.name), ["@scope/pkg", "shipped"]);
        assert.deepEqual(missing, []);
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});

test("collectBundledPackages reports a shipped package with no licence text", async () => {
    const root = await fixture();
    try {
        const meta = metafileFor([["node_modules/nolicence/index.js", 10]]);
        const { missing } = await collectBundledPackages([meta], { cwd: root });
        assert.deepEqual(missing.map((p) => p.name), ["nolicence"]);
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});

test("an override supplies text for a package that ships none", async () => {
    const root = await fixture();
    try {
        const meta = metafileFor([["node_modules/nolicence/index.js", 10]]);
        const overrides = { nolicence: { text: "OVERRIDE TEXT" } };
        const { packages, missing } = await collectBundledPackages([meta], { cwd: root, overrides });
        assert.deepEqual(missing, []);
        assert.equal(packages[0].text, "OVERRIDE TEXT");
        assert.equal(packages[0].overridden, true);
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});

test("an override never displaces a package's own licence file", async () => {
    const root = await fixture();
    try {
        const meta = metafileFor([["node_modules/shipped/index.js", 10]]);
        const { packages } = await collectBundledPackages([meta], { cwd: root, overrides: { shipped: { text: "WRONG" } } });
        assert.equal(packages[0].text, "SHIPPED TEXT");
        assert.equal(packages[0].overridden, false, "a package that ships its own licence is not marked overridden");
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});

test("collectBundledPackages merges both halves of the build and deduplicates", async () => {
    const root = await fixture();
    try {
        const host = metafileFor([["node_modules/shipped/index.js", 10]]);
        const webview = metafileFor([["node_modules/shipped/index.js", 20], ["node_modules/@scope/pkg/a.js", 5]]);
        const { packages } = await collectBundledPackages([host, webview], { cwd: root });
        assert.deepEqual(packages.map((p) => p.name), ["@scope/pkg", "shipped"]);
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});

/* ------------------------------------------------------------------ *
 * Rendering
 * ------------------------------------------------------------------ */

test("renderNotice lists the package and embeds its licence verbatim", () => {
    const html = renderNotice([{ name: "thing", version: "1.2.3", licence: "MIT", homepage: "https://example.com", text: "TEXT HERE" }]);
    assert.match(html, /thing 1\.2\.3 - MIT/);
    assert.match(html, /TEXT HERE/);
    assert.match(html, /<a href="https:\/\/example\.com">/);
});

test("renderNotice escapes licence text rather than emitting it as markup", () => {
    const html = renderNotice([{ name: "x", version: "1", licence: "MIT", homepage: null, text: 'a <b> & "c"' }]);
    assert.ok(!html.includes("<b>"), "raw markup from a licence must not reach the document");
    assert.match(html, /a &lt;b&gt; &amp; &quot;c&quot;/);
});

test("renderNotice omits the link when a package declares no homepage", () => {
    const html = renderNotice([{ name: "x", version: "1", licence: "MIT", homepage: null, text: "T" }]);
    // The boilerplate header always links to the source-request address, so scope
    // the check to the list entry rather than the whole document.
    const entry = html.slice(html.indexOf("<ol>"), html.indexOf("</ol>"));
    assert.ok(!entry.includes("<a href"), "no empty anchor should be produced for the entry");
});
