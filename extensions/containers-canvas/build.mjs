/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// Bundles both halves into `dist/`, so the extension runs with no
// `node_modules` present (which also makes it gist-shareable).
//
//   dist/host.mjs        - Node/ESM: attachTrpc + the app router + the stub panel
//   dist/webview/main.js - browser/ESM: React + Fluent + the postMessage shim

import { build } from "esbuild";
import { copyFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { generateNotice } from "./scripts/generateNotice.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const outWebview = join(here, "dist", "webview");

await mkdir(outWebview, { recursive: true });

// Host half. The `vscode` alias is what makes `@microsoft/vscode-ext-webview/host`
// loadable outside VS Code: its barrel requires `vscode` at load time even though
// attachTrpc itself only needs the types.
//
// The runtime adapter stays external so both canvases keep sharing one copy. The
// specifier is preserved verbatim in the output, which works because `src/` and
// `dist/` sit at the same depth -- `../../` reaches the extensions folder from
// either.

// `dist/` is committed and installs without a build step, so the shipped bundles
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
    outfile: join(here, "dist", "host.mjs"),
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
    banner: { js: legalBanner },
    define: { "process.env.NODE_ENV": '"production"' },
    loader: { ".ttf": "file" },
    logLevel: "info",
}).then((result) => webviewMeta = result.metafile);

await copyFile(join(here, "src", "webview", "index.html"), join(outWebview, "index.html"));

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
