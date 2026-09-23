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

import { computeInputDigest, DIGEST_FILE } from "./buildInputs.mjs";

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

// 2. Is the notice current? Unlike the bundle, this one is reproducible.
if (await insideGitRepository()) {
    const drift = await driftIn(["NOTICE.html"]);
    if (drift.length > 0) {
        console.error(
            `\n[verify] NOTICE.html does not match the commit:\n${drift.map((e) => `  ${e}`).join("\n")}\n\n` +
            REBUILD_HINT,
        );
        process.exit(1);
    }
} else {
    // An installed plugin is not a git checkout. Verifying there is meaningless
    // rather than failing, so say why and carry on.
    console.error("[verify] not a git checkout; skipping the NOTICE.html comparison");
}

console.error(`[verify] bundle matches source (digest ${digest.slice(0, 12)}, ${fileCount} files); NOTICE.html current`);
