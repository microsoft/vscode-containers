/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// Bundles both halves into `bundle/`, so the extension runs with no
// `node_modules` present (which also makes it gist-shareable).
//
//   bundle/host.mjs        - Node/ESM: attachTrpc + the app router + the stub panel
//   bundle/webview/main.js - browser/ESM: React + Fluent + the postMessage shim
//
// Not `dist/`: the extension packaging flow treats a directory called `dist` as
// regenerable build output and drops it, which for this package means dropping
// the only thing that runs. Verified by sharing a probe extension -- `bundle/`
// and `assets/nested/` both survived, `dist/` did not.

import { build } from "esbuild";
import { copyFile, mkdir, readdir, readFile, stat } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { generateNotice } from "./scripts/generateNotice.mjs";
import { verifyManifest } from "./scripts/verifyManifest.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const outWebview = join(here, "bundle", "webview");

// Checked before anything is emitted: this manifest is installed verbatim by
// users, so a specifier only pnpm understands is a shipped defect, not a local
// inconvenience.
verifyManifest(JSON.parse(await readFile(join(here, "package.json"), "utf8")));

await mkdir(outWebview, { recursive: true });

// Host half. The `vscode` alias is what makes `@microsoft/vscode-ext-webview/host`
// loadable outside VS Code: its barrel requires `vscode` at load time even though
// attachTrpc itself only needs the types.
//
// The runtime adapter stays external so both canvases keep sharing one copy. The
// specifier is preserved verbatim in the output, which works because `src/` and
// `bundle/` sit at the same depth -- `../../` reaches the extensions folder from
// either.

// `bundle/` is committed and installs without a build step, so the shipped bundles
// are what users actually receive. They carry the notice rather than relying on
// the sources, and point at NOTICE.html because bundling pulls in third-party
// code (React, Fluent UI, xterm) alongside ours.
const legalBanner = [
    "/*!",
    " * Copyright (c) Microsoft Corporation. All rights reserved.",
    " * Licensed under the MIT License. See LICENSE.md in the project root for license information.",
    " *",
    " * This bundle includes third-party software. See NOTICE.html for attributions.",
    " */",
].join("\n");

let hostMeta;
let webviewMeta;

await build({
    entryPoints: [join(here, "src", "index.mjs")],
    outfile: join(here, "bundle", "host.mjs"),
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node20",
    external: ["@github/copilot-sdk", "@lydell/node-pty"],
    alias: { vscode: join(here, "src", "vscode-stub.mjs") },
    metafile: true,
    banner: {
        js: [
            legalBanner,
            'import { createRequire as __nodeCreateRequire } from "node:module";',
            "const require = __nodeCreateRequire(import.meta.url);",
        ].join("\n"),
    },
    logLevel: "info",
}).then((result) => hostMeta = result.metafile);


// Webview half.
await build({
    entryPoints: [join(here, "src", "webview", "main.jsx")],
    outdir: outWebview,
    bundle: true,
    format: "esm",
    target: "es2022",
    jsx: "automatic",
    minify: true,
    sourcemap: false,
    metafile: true,
    splitting: true,
    // Code splitting needs shared chunks to have stable, collision-free names.
    chunkNames: "chunks/[name]-[hash]",
    banner: { js: legalBanner },
    define: { "process.env.NODE_ENV": '"production"' },
    loader: { ".ttf": "file" },
    logLevel: "info",
}).then((result) => webviewMeta = result.metafile);

await copyFile(join(here, "src", "webview", "index.html"), join(outWebview, "index.html"));

/*
 * Fail the build if any shipped file would be rejected at install time.
 *
 * The extension installer refuses files over 1 MB. That was found the hard way:
 * a 1.35 MB webview bundle installed cleanly and then failed to load, because
 * the oversized file was dropped rather than reported. A size ceiling is easy
 * to drift back over -- one more dependency in the shared chunk would do it --
 * and the failure mode is silent and remote, so it is checked here instead.
 */
const INSTALL_FILE_LIMIT_BYTES = 1_000_000;

async function* walk(dir) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) yield* walk(full);
        else yield full;
    }
}

const oversized = [];
let largest = { path: "", size: 0 };
for await (const file of walk(join(here, "bundle"))) {
    const { size } = await stat(file);
    if (size > largest.size) largest = { path: file, size };
    if (size > INSTALL_FILE_LIMIT_BYTES) oversized.push({ file, size });
}

if (oversized.length > 0) {
    const list = oversized
        .map(({ file, size }) => `  ${(size / 1_000_000).toFixed(2)} MB  ${relative(here, file)}`)
        .join("\n");
    throw new Error(
        `${oversized.length} file(s) exceed the ${INSTALL_FILE_LIMIT_BYTES.toLocaleString()} byte install limit:\n${list}\n` +
        "These would be dropped during install and the extension would fail to load at runtime.\n" +
        "Split the offending entry point (see the lazy views in src/webview/main.jsx).",
    );
}

console.error(
    `[build] largest shipped file: ${(largest.size / 1_000_000).toFixed(2)} MB ` +
    `(${relative(here, largest.path)}), limit ${(INSTALL_FILE_LIMIT_BYTES / 1_000_000).toFixed(2)} MB`,
);

// The notice is derived from the metafiles above rather than maintained by hand,
// so it cannot drift from what was actually bundled. Adding a dependency updates
// it on the next build; adding one with no licence text fails the build.
const attributed = await generateNotice({
    metafiles: [hostMeta, webviewMeta],
    cwd: here,
    outFile: join(here, "NOTICE.html"),
});
console.error(`[build] NOTICE.html covers ${attributed.length} third-party packages`);

console.error("[build] done");
