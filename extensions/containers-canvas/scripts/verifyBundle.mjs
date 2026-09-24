/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Fails if the generated files committed to this repository are stale.
//
// Most packages here do not need this: their build output is transient and only
// the source is committed. This one commits `bundle/` and `NOTICE.html`, because
// a Copilot plugin is installed straight from a git ref with no build step --
// whatever is committed is what users execute.
//
// That makes staleness invisible rather than loud. Editing a source file and
// forgetting to rebuild leaves every existing gate green -- unit tests pass
// because they import `src/`, lint passes, and `git status` shows only the
// source file as modified -- while users installing from that commit run the
// previous bundle. The repository then describes behaviour the shipped code does
// not have.
//
// Two different checks, because the two outputs behave differently:
//
//   bundle/      compared by input digest. The bytes are not reproducible across
//                platforms (see buildInputs.mjs), so comparing them would fail
//                every CI run on Linux for output that is functionally correct.
//   NOTICE.html  compared byte for byte. It is derived from package metadata
//                rather than from bundled code, and a Linux build was verified
//                to produce an identical file, so drift here is real drift.
//
// Run after the build, which is why it is wired to `package` rather than `test`:
// the shared CI template runs lint, then build, then package.

import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { computeInputDigest, computeOutputInventory, DIGEST_FILE } from "./buildInputs.mjs";

const exec = promisify(execFile);
const here = dirname(fileURLToPath(import.meta.url));
const packageRoot = join(here, "..");

const REBUILD_HINT =
    "Run `pnpm --filter containers-canvas build` and commit the result.\n" +
    "These files are committed because the plugin installs with no build step,\n" +
    "so the committed bytes are what users run.\n";

/**
 * Paths whose working-tree content differs from the commit, as porcelain entries.
 *
 * `git status --porcelain` is used rather than `git diff` so that an untracked
 * generated file is reported too. A diff would silently ignore it, which is the
 * more dangerous direction: a file that exists locally but was never committed
 * is missing for users.
 */
async function driftIn(paths) {
    const { stdout } = await exec("git", ["status", "--porcelain", "--", ...paths], { cwd: packageRoot });
    // Trailing whitespace only. The two leading characters are the index and
    // worktree status columns, and trimming them away loses the difference
    // between "staged for deletion" and "missing from disk".
    return stdout.split("\n").filter((line) => line.trim().length > 0).map((line) => line.replace(/\s+$/, ""));
}

async function insideGitRepository() {
    try {
        const { stdout } = await exec("git", ["rev-parse", "--is-inside-work-tree"], { cwd: packageRoot });
        return stdout.trim() === "true";
    } catch {
        return false;
    }
}

/** This package's path within the repository, as git reports it. */
async function packagePrefix() {
    const { stdout } = await exec("git", ["rev-parse", "--show-prefix"], { cwd: packageRoot });
    return stdout.trim();
}

/**
 * Files under `bundle/` in the commit, package-relative.
 *
 * Read from `HEAD` rather than from disk: what a local rebuild happens to have
 * produced is not the question, and on a different platform it will not even
 * have the same filenames.
 *
 * Run from the package directory, so both the pathspec and the reported paths
 * are already package-relative. `git show` below is the opposite — its argument
 * is resolved from the repository root — which is why only that one takes the
 * prefix.
 */
async function committedBundleFiles() {
    try {
        const { stdout } = await exec(
            "git",
            ["ls-tree", "-r", "--name-only", "HEAD", "--", "bundle"],
            { cwd: packageRoot, maxBuffer: 16 * 1024 * 1024 },
        );
        const files = stdout.split("\n").map((line) => line.trim()).filter(Boolean);
        return files.length > 0 ? files : null;
    } catch {
        // No commits yet, or `bundle/` has never been committed.
        return null;
    }
}

/** The output inventory as committed, which may differ from the one on disk. */
async function committedInventoryOutputs() {
    try {
        const prefix = await packagePrefix();
        const { stdout } = await exec(
            "git",
            ["show", `HEAD:${prefix}${DIGEST_FILE.split(/[\\/]/).join("/")}`],
            { cwd: packageRoot, maxBuffer: 16 * 1024 * 1024 },
        );
        const parsed = JSON.parse(stdout);
        return Array.isArray(parsed.outputs) ? parsed.outputs : null;
    } catch {
        return null;
    }
}

// 1. Is the committed bundle built from the source that is here now?
let recorded;
try {
    recorded = JSON.parse(await readFile(join(packageRoot, DIGEST_FILE), "utf8"));
} catch {
    console.error(
        `\n[verify] ${DIGEST_FILE.split(/[\\/]/).join("/")} is missing, so the committed bundle ` +
        `cannot be shown to match the source.\n\n${REBUILD_HINT}`,
    );
    process.exit(1);
}

const { digest, fileCount } = await computeInputDigest(packageRoot);

if (recorded.digest !== digest) {
    console.error(
        "\n[verify] the committed bundle was built from different source than is here now:\n" +
        `  recorded ${String(recorded.digest).slice(0, 16)} over ${recorded.fileCount} files\n` +
        `  current  ${digest.slice(0, 16)} over ${fileCount} files\n\n${REBUILD_HINT}`,
    );
    process.exit(1);
}

// 2. Is the bundle it describes still on disk, and unaltered?
//
// The digest above proves the bundle was built from this source. It says
// nothing about whether the bundle still exists: deleting
// `bundle/webview/main.js` left the digest untouched and this check green while
// the installed plugin was broken.
const recordedOutputs = Array.isArray(recorded.outputs) ? recorded.outputs : null;
if (!recordedOutputs) {
    console.error(
        `\n[verify] ${DIGEST_FILE.split(/[\\/]/).join("/")} has no output inventory, so a missing or ` +
        `hand-edited bundle file cannot be detected.\n\n${REBUILD_HINT}`,
    );
    process.exit(1);
}

const actualOutputs = await computeOutputInventory(packageRoot);
const actualByPath = new Map(actualOutputs.map((entry) => [entry.path, entry.hash]));
const missing = recordedOutputs.filter((entry) => !actualByPath.has(entry.path));
const altered = recordedOutputs.filter((entry) => {
    const hash = actualByPath.get(entry.path);
    return hash !== undefined && hash !== entry.hash;
});
const unrecorded = actualOutputs.filter(
    (entry) => !recordedOutputs.some((recordedEntry) => recordedEntry.path === entry.path),
);

if (missing.length > 0 || altered.length > 0 || unrecorded.length > 0) {
    const describe = (label, entries) => (entries.length > 0
        ? `\n  ${label}:\n${entries.map((entry) => `    ${entry.path}`).join("\n")}`
        : "");
    console.error(
        "\n[verify] the committed bundle does not match what the build recorded:" +
        describe("missing", missing) +
        describe("changed since the build", altered) +
        describe("present but not recorded", unrecorded) +
        `\n\n${REBUILD_HINT}`,
    );
    process.exit(1);
}

// 3. Is the notice current, and is every generated file actually committed?
if (await insideGitRepository()) {
    const drift = await driftIn(["NOTICE.html"]);
    if (drift.length > 0) {
        console.error(
            `\n[verify] NOTICE.html does not match the commit:\n${drift.map((e) => `  ${e}`).join("\n")}\n\n` +
            REBUILD_HINT,
        );
        process.exit(1);
    }

    /*
     * Is the *committed* bundle internally complete?
     *
     * This deliberately does not look at the working tree. An earlier version
     * did, failing on untracked and deleted files under `bundle/`, and it broke
     * every CI run: the build there reproduces the bundle on Linux, where
     * content-hashed chunk names differ from the ones committed from Windows,
     * so the old names read as deleted and the new ones as untracked. That is
     * the same platform difference the input digest exists to tolerate, so
     * reintroducing it through git was a mistake.
     *
     * Asking the question of the commit alone answers it without involving
     * whatever the local rebuild produced: every output the committed
     * `build-inputs.json` names must be a file that is actually committed, and
     * every committed bundle file must be one it names. That catches a chunk
     * that was emitted but never added, or removed without the inventory being
     * regenerated — on any platform.
     */
    const committed = await committedBundleFiles();
    if (committed === null) {
        console.error("[verify] no commit to compare against yet; skipping the committed-bundle check");
    } else {
        const committedInventory = await committedInventoryOutputs();
        const committedNames = new Set(committed);
        const inventoryNames = new Set((committedInventory ?? []).map((entry) => entry.path));

        const notCommitted = [...inventoryNames].filter((path) => !committedNames.has(path));
        const notRecorded = [...committedNames].filter(
            (path) => path !== DIGEST_FILE.split(/[\\/]/).join("/") && !inventoryNames.has(path),
        );

        if (committedInventory === null) {
            console.error(
                `\n[verify] the committed ${DIGEST_FILE.split(/[\\/]/).join("/")} has no output inventory.\n\n${REBUILD_HINT}`,
            );
            process.exit(1);
        }
        if (notCommitted.length > 0 || notRecorded.length > 0) {
            const describe = (label, entries) => (entries.length > 0
                ? `\n  ${label}:\n${entries.map((path) => `    ${path}`).join("\n")}`
                : "");
            console.error(
                "\n[verify] the committed bundle is not internally consistent:" +
                describe("recorded by the build but never committed", notCommitted) +
                describe("committed but not recorded by the build", notRecorded) +
                `\n\n${REBUILD_HINT}`,
            );
            process.exit(1);
        }
    }
} else {
    // An installed plugin is not a git checkout. Verifying there is meaningless
    // rather than failing, so say why and carry on.
    console.error("[verify] not a git checkout; skipping the committed-file comparison");
}

console.error(
    `[verify] bundle matches source (digest ${digest.slice(0, 12)}, ${fileCount} files), ` +
    `${recordedOutputs.length} outputs present; NOTICE.html current`,
);
