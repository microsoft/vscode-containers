/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// A digest of everything the bundle is built from.
//
// `verifyBundle.mjs` used to prove the committed bundle was current by rebuilding
// it and diffing the bytes. That cannot work here: the bundle is not reproducible
// across platforms, and the reason is not esbuild. pnpm's virtual store directory
// is named differently on Windows, which shortens it, than on Linux:
//
//   win   node_modules/.pnpm/@microsoft+vscode-ext-webvi_470e7b0bbbbe9c61ee15e7557c93cfbf/
//   linux node_modules/.pnpm/@microsoft+vscode-ext-webview@0.10.1_@trpc+client@11.18.0_...
//
// esbuild writes those paths into the unminified host bundle as comments, and
// folds them into the `[hash]` of every shared webview chunk. A Linux build of
// the identical source therefore differs from a Windows one in 14 of 18 files,
// while being functionally identical -- verified by running the Linux output
// through `verify:panel`, which passed 9/9 including lazy chunk loading.
//
// So the byte comparison answered "was this built on the same OS?" when the
// question worth asking is "was this built from the current source?". This digest
// asks that one instead, over files this repository owns, so it is identical
// everywhere.
//
// Line endings are normalised before hashing. A Windows checkout with
// `core.autocrlf=true` has CRLF in the working tree where Linux has LF, and
// hashing raw bytes would reintroduce exactly the cross-platform failure this
// replaces.
//
// The lockfile is deliberately not an input. It would be the conservative
// choice, but in a monorepo any unrelated dependency change would then demand a
// rebuild of this package before CI could pass again, making it a nuisance to
// everyone else. The staleness this guards against is a source edit without a
// rebuild.

import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

/** Where the digest is written, relative to the package root. */
export const DIGEST_FILE = join("bundle", "build-inputs.json");

/**
 * Hand-written files that shape the output without being compiled into it.
 *
 * `index.html` is copied into `bundle/webview/` rather than bundled, so esbuild
 * never reports it as an input even though editing it changes what ships.
 */
export const EXTRA_INPUTS = [
    "build.mjs",
    "scripts/generateNotice.mjs",
    "package.json",
    "src/webview/index.html",
];

async function* walk(dir) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) {
            yield* walk(full);
        } else if (entry.isFile()) {
            yield full;
        }
    }
}

/**
 * A digest of the source files the bundle is built from.
 *
 * The file list is supplied rather than discovered. An earlier version walked
 * `src/` and added a hand-written handful of extras, which quietly missed
 * `server.mjs` and `execSessions.mjs` — both compiled into `bundle/host.mjs`,
 * both outside `src/`. Editing either left the digest unchanged and a stale
 * bundle looking current. The build now passes the set esbuild reports in its
 * metafile, so the list cannot drift away from what is actually compiled.
 *
 * Paths are recorded with forward slashes and sorted, so the result does not
 * depend on the platform's separator or on directory read order.
 */
export async function computeInputDigest(packageRoot, files) {
    const paths = [...new Set(files.map((file) => file.split(/[\\/]/).join("/")))]
        .sort((a, b) => a.localeCompare(b, "en"));

    const entries = await Promise.all(paths.map(async (path) => {
        const text = (await readFile(join(packageRoot, path), "utf8")).replace(/\r\n/g, "\n");
        return { path, hash: createHash("sha256").update(text).digest("hex") };
    }));

    const digest = createHash("sha256");
    for (const entry of entries) {
        digest.update(`${entry.path}\n${entry.hash}\n`);
    }
    return { digest: digest.digest("hex"), fileCount: entries.length, inputs: paths };
}

/**
 * The files this package contributes to a build, from esbuild's metafile.
 *
 * Dependencies are excluded: they are pinned by the lockfile and described by
 * `NOTICE.html`, and hashing several thousand files in `node_modules` to detect
 * a change that `pnpm install` already gates would be slow for no gain.
 */
export function ownInputsFrom(metafiles) {
    const paths = new Set();
    for (const metafile of metafiles) {
        for (const input of Object.keys(metafile?.inputs ?? {})) {
            if (input.includes("node_modules") || input.startsWith("..")) continue;
            paths.add(input.split(/[\\/]/).join("/"));
        }
    }
    return [...paths];
}

/**
 * Every file the build emitted, with its hash.
 *
 * The input digest alone says the bundle was built from this source; it says
 * nothing about whether the bundle is still *there*. Deleting
 * `bundle/webview/main.js` left the digest untouched and `package` green while
 * the installed plugin was broken. Recording the outputs closes that: the check
 * can then notice a file that has gone missing or been edited by hand.
 *
 * Hashed as bytes rather than normalised text, because these are build
 * artifacts that no checkout should be rewriting.
 */
export async function computeOutputInventory(packageRoot = join(here, "..")) {
    const files = [];
    for await (const file of walk(join(packageRoot, "bundle"))) {
        if (relative(packageRoot, file).split(/[\\/]/).join("/") === DIGEST_FILE_POSIX) continue;
        files.push(file);
    }

    const entries = await Promise.all(files.map(async (file) => {
        const bytes = await readFile(file);
        return {
            path: relative(packageRoot, file).split(/[\\/]/).join("/"),
            hash: createHash("sha256").update(bytes).digest("hex"),
        };
    }));

    entries.sort((a, b) => a.path.localeCompare(b.path, "en"));
    return entries;
}

/** The digest file itself, which cannot describe its own contents. */
const DIGEST_FILE_POSIX = "bundle/build-inputs.json";
