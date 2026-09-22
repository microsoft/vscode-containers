/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Generates this package's third-party NOTICE from what the build actually bundled.
//
// The repository's root NOTICE.html is produced by release tooling and covers the
// VS Code extension's dependencies. This package bundles a different set -- React,
// Fluent UI, xterm, tRPC, ws, zod and their transitive dependencies are compiled
// into `bundle/`, which is committed and installed straight from a git ref.
// Shipping those bytes without attribution is a licensing problem, so the notice
// is generated here, from evidence, at build time.
//
// The evidence is esbuild's metafile: the set of files that ended up in the output,
// not a guess from `package.json`. That distinction matters because devDependencies
// overstate what ships (`esbuild` and `typescript` are build tools and are not in
// the bundle) while `dependencies` understate it (transitive packages like
// `scheduler` and `@griffel/core` are bundled without being declared).
//
// Anything bundled without a readable licence file fails the build rather than
// being silently dropped. A notice that is quietly incomplete is worse than one
// that is loudly missing, because only the second gets fixed.

import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";

/** Files that conventionally carry licence text. */
const LICENCE_FILE_PATTERN = /^(LICEN[CS]E|COPYING|UNLICENSE)([.-]|$)/i;

/**
 * Packages referenced by the build that contribute no shipped code.
 *
 * `esbuild` is the compiler rather than an input. The two externals are left out
 * of the bundle deliberately: the SDK is provided by the host, and node-pty is an
 * optional native package the user installs themselves, carrying its own licence.
 */
const NOT_SHIPPED = new Set(["esbuild", "@github/copilot-sdk", "@lydell/node-pty"]);

/**
 * Licence text for packages that ship none of their own.
 *
 * Every entry here is a judgement call that a human should re-check at release,
 * which is why they are written out in full rather than synthesised from an SPDX
 * identifier at build time. Nothing is added here to silence the build: a package
 * whose licence cannot be established should be dropped instead.
 *
 * Reviewed 2026-09-18.
 */
export const LICENCE_OVERRIDES = {
    // Declares `"license": "MIT"` in its package.json and publishes only
    // package.json and README.md -- no licence file. Published by Microsoft from
    // microsoft/fluentui-system-icons. The text below is the one its sibling
    // @fluentui/react-components ships for the same copyright holder, including
    // the assets clause, which is the relevant one here because this package is
    // icons. Verify against the upstream repository before shipping.
    "@fluentui/react-icons": {
        source: "matches the LICENSE shipped by @fluentui/react-components (same publisher)",
        text: `@fluentui/react-icons

Copyright (c) Microsoft Corporation

All rights reserved.

MIT License

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the ""Software""), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED *AS IS*, WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

Note: Usage of the fonts and icons referenced in Fluent UI React is subject to the terms listed at https://aka.ms/fluentui-assets-license`,
    },
};

/**
 * Find the node_modules package that owns a file.
 *
 * pnpm stores real packages under `.pnpm/<name>@<version>/node_modules/<name>/`,
 * so the owner is always the entry after the *last* `node_modules` segment --
 * taking two segments when the name is scoped.
 */
function owningPackageDir(inputPath) {
    const parts = inputPath.split(/[\\/]/);
    const last = parts.lastIndexOf("node_modules");
    if (last === -1) return null;
    const rest = parts.slice(last + 1);
    if (rest.length === 0) return null;
    const take = rest[0].startsWith("@") ? 2 : 1;
    if (rest.length < take) return null;
    return parts.slice(0, last + 1 + take).join(path.sep);
}

async function readJson(file) {
    try {
        return JSON.parse(await readFile(file, "utf8"));
    } catch {
        return null;
    }
}

/** Read the licence text a package ships, or null when it ships none. */
async function readLicenceText(dir) {
    let entries;
    try {
        entries = await readdir(dir, { withFileTypes: true });
    } catch {
        return null;
    }
    const candidates = entries
        .filter((entry) => entry.isFile() && LICENCE_FILE_PATTERN.test(entry.name))
        .map((entry) => entry.name)
        // Prefer a plain LICENSE over LICENSE-MIT and friends.
        .sort((a, b) => a.length - b.length || a.localeCompare(b));

    for (const name of candidates) {
        const text = (await readFile(path.join(dir, name), "utf8")).trim();
        if (text) return text;
    }
    return null;
}

function homepageOf(manifest) {
    if (typeof manifest.homepage === "string" && manifest.homepage) return manifest.homepage;
    const repo = manifest.repository;
    const url = typeof repo === "string" ? repo : repo?.url;
    if (!url) return null;
    // Normalise the git remote forms npm allows into something linkable.
    return url
        .replace(/^git\+/, "")
        .replace(/\.git$/, "")
        .replace(/^git:\/\//, "https://")
        .replace(/^github:/, "https://github.com/");
}

function licenceNameOf(manifest) {
    if (typeof manifest.license === "string") return manifest.license;
    if (typeof manifest.license?.type === "string") return manifest.license.type;
    if (Array.isArray(manifest.licenses)) {
        return manifest.licenses.map((entry) => entry?.type).filter(Boolean).join(" OR ");
    }
    return null;
}

const escapeHtml = (value) => String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

/**
 * Collect every third-party package that contributed bytes to the output.
 *
 * Deliberately reads `outputs[].inputs[].bytesInOutput` rather than the top-level
 * `inputs` map. The latter lists every file esbuild *parsed*, including code that
 * tree-shaking then discarded -- importing one component from the Fluent barrel
 * pulls in a carousel library that contributes zero bytes. Attributing that would
 * claim we redistribute code we do not ship, which is its own kind of wrong.
 *
 * Returns `{ packages, missing }`, where `missing` lists anything shipped whose
 * licence text could not be read.
 */
export async function collectBundledPackages(metafiles, { cwd, overrides = {} }) {
    const byDir = new Map();

    for (const metafile of metafiles) {
        for (const output of Object.values(metafile.outputs ?? {})) {
            for (const [input, detail] of Object.entries(output.inputs ?? {})) {
                if (!(detail?.bytesInOutput > 0)) continue;

                const dir = owningPackageDir(path.resolve(cwd, input));
                if (!dir) continue;                   // first-party source
                if (byDir.has(dir)) continue;

                const manifest = await readJson(path.join(dir, "package.json"));
                if (!manifest?.name) continue;
                if (NOT_SHIPPED.has(manifest.name)) continue;

                const override = overrides[manifest.name];
                const own = await readLicenceText(dir);
                byDir.set(dir, {
                    dir,
                    name: manifest.name,
                    version: manifest.version ?? "",
                    licence: licenceNameOf(manifest),
                    homepage: homepageOf(manifest),
                    text: own ?? override?.text ?? null,
                    // True only when the override was actually used. A package
                    // that ships its own licence is never overridden, so that an
                    // audit of this flag lists exactly the human judgement calls.
                    overridden: !own && Boolean(override?.text),
                });
            }
        }
    }

    const packages = [...byDir.values()].sort((a, b) =>
        a.name.localeCompare(b.name) || a.version.localeCompare(b.version));
    return { packages, missing: packages.filter((entry) => !entry.text) };
}

/** Render the collected packages in the same shape as the repository's root NOTICE.html. */
export function renderNotice(packages) {
    const entries = packages.map((pkg) => {
        const title = `${pkg.name} ${pkg.version}${pkg.licence ? ` - ${pkg.licence}` : ""}`;
        const link = pkg.homepage
            ? `\n        <p><a href="${escapeHtml(pkg.homepage)}">${escapeHtml(pkg.homepage)}</a></p>`
            : "";
        return `<li>
    <details>
        <summary>
            ${escapeHtml(title)}
        </summary>${link}
        <pre>
${escapeHtml(pkg.text)}
        </pre>
    </details>
</li>`;
    });

    return `<!DOCTYPE html>
<html lang="en">
    <head>
        <title>NOTICES AND INFORMATION</title>
        <style>
            pre {
                white-space: pre-wrap;
                background: #eee;
                padding: 24px;
            }
        </style>
    </head>
    <body>
        <h1>NOTICES AND INFORMATION</h1>
        <p><strong>Do Not Translate or Localize</strong></p>
        <p>
            This software incorporates material from third parties.
            Microsoft makes certain open source code available at <a href="https://3rdpartysource.microsoft.com">https://3rdpartysource.microsoft.com</a>,
            or you may send a check or money order for US $5.00, including the product name,
            the open source component name, platform, and version number, to:
        </p>
        <address>
            Source Code Compliance Team<br />
            Microsoft Corporation<br />
            One Microsoft Way<br />
            Redmond, WA 98052<br />
            USA
        </address>
        <p>
            Notwithstanding any other terms, you may reverse engineer this software to the extent
            required to debug changes to any libraries licensed under the GNU Lesser General Public License.
        </p>
        <ol>
${entries.join("\n")}
        </ol>
    </body>
</html>
`;
}

/**
 * Write the notice for a build. Throws if anything shipped has no licence text,
 * so an incomplete notice can never be produced quietly.
 */
export async function generateNotice({ metafiles, cwd, outFile, overrides = LICENCE_OVERRIDES }) {
    const { packages, missing } = await collectBundledPackages(metafiles, { cwd, overrides });

    if (missing.length > 0) {
        const list = missing.map((entry) => `  - ${entry.name} ${entry.version} (${entry.dir})`).join("\n");
        throw new Error(
            `Cannot generate NOTICE.html: ${missing.length} bundled package(s) ship no readable licence file.\n${list}\n` +
            "Add the text by hand or drop the dependency; do not ship an incomplete notice.",
        );
    }

    await writeFile(outFile, renderNotice(packages), "utf8");
    return packages;
}

export const __internals = { owningPackageDir, homepageOf, licenceNameOf, escapeHtml, readLicenceText };
