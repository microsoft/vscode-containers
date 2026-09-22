/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// Fails if the generated files committed to this repository no longer match what
// the build produces from source.
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
// Run after the build, which is why it is wired to `package` rather than `test`:
// the shared CI template runs lint, then build, then package.

import { execFile } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const exec = promisify(execFile);
const here = dirname(fileURLToPath(import.meta.url));
const packageRoot = join(here, "..");

/** Generated and committed. Everything else in this package is hand-written. */
const GENERATED_PATHS = ["bundle", "NOTICE.html"];

/**
 * Paths whose working-tree content differs from the commit, as porcelain entries.
 *
 * `git status --porcelain` is used rather than `git diff` so that an untracked
 * generated file -- a new chunk the build started emitting, say -- is reported
 * too. A diff would silently ignore it, which is the more dangerous direction:
 * a chunk that exists locally but was never committed is missing for users.
 */
async function generatedFileDrift() {
    const { stdout } = await exec("git", ["status", "--porcelain", "--", ...GENERATED_PATHS], { cwd: packageRoot });
    return stdout.split("\n").map((line) => line.trim()).filter(Boolean);
}

async function insideGitRepository() {
    try {
        const { stdout } = await exec("git", ["rev-parse", "--is-inside-work-tree"], { cwd: packageRoot });
        return stdout.trim() === "true";
    } catch {
        return false;
    }
}

const drift = await insideGitRepository() ? await generatedFileDrift() : null;

if (drift === null) {
    // An installed plugin is not a git checkout. Verifying there is meaningless
    // rather than failing, so say why and succeed.
    console.error("[verify] not a git checkout; skipping the generated-file check");
} else if (drift.length > 0) {
    const list = drift.map((entry) => `  ${entry}`).join("\n");
    console.error(
        `\n[verify] generated files do not match the commit:\n${list}\n\n` +
        "These are committed because the plugin installs with no build step, so the\n" +
        "committed bytes are what users run. Commit the rebuilt output, or run\n" +
        "`pnpm --filter containers-canvas build` if you have not rebuilt since\n" +
        "changing source.\n",
    );
    process.exit(1);
} else {
    console.error(`[verify] generated files match the commit (${GENERATED_PATHS.join(", ")})`);
}
