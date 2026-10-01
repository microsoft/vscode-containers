/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Checks that the package.json we ship is one a user can actually install from.
//
// This file has two audiences and they want different things. pnpm reads it as a
// workspace manifest -- scripts, devDependencies, the whole build graph. Users
// read it as part of an installed plugin, because a Copilot plugin is installed
// straight from a git ref with no build step, so the source manifest *is* the
// shipped manifest. There is no separate artifact to strip.
//
// That split has already produced one real failure. `"esbuild": "catalog:"` is
// valid pnpm and meaningless to npm, and the README asks users to run
// `npm install @lydell/node-pty` in the plugin root for the terminal. Anyone who
// followed it got:
//
//   npm error code EUNSUPPORTEDPROTOCOL
//   npm error Unsupported URL Type "catalog:": catalog:
//
// Note that `--omit=dev` does not avoid this -- npm parses every dependency
// field before deciding what to install, so a devDependency it will never
// install still breaks the command. Checking only runtime dependencies would
// have missed the exact bug that shipped.

/** Dependency specifiers npm cannot resolve, whatever the field they appear in. */
const UNSUPPORTED_PROTOCOLS = [
    { prefix: "catalog:", why: "pnpm catalog reference; npm fails with EUNSUPPORTEDPROTOCOL" },
    { prefix: "workspace:", why: "pnpm/yarn workspace reference; resolves to nothing once installed" },
    { prefix: "link:", why: "links to a path that will not exist on a user's machine" },
    { prefix: "portal:", why: "yarn portal reference; unsupported by npm" },
    { prefix: "file:", why: "points at a local path that does not ship with the plugin" },
];

const DEPENDENCY_FIELDS = ["dependencies", "devDependencies", "optionalDependencies", "peerDependencies"];

/**
 * Inspect a parsed manifest. Returns `{ problems }`, each `{ field, name, spec, why }`.
 *
 * Deliberately returns rather than throws so callers can report every problem at
 * once instead of one per build.
 */
export function inspectManifest(manifest) {
    const problems = [];
    for (const field of DEPENDENCY_FIELDS) {
        const entries = manifest?.[field];
        if (!entries || typeof entries !== "object") continue;
        for (const [name, spec] of Object.entries(entries)) {
            if (typeof spec !== "string") {
                problems.push({ field, name, spec: String(spec), why: "specifier must be a string" });
                continue;
            }
            const hit = UNSUPPORTED_PROTOCOLS.find((protocol) => spec.startsWith(protocol.prefix));
            if (hit) problems.push({ field, name, spec, why: hit.why });
        }
    }
    return { problems };
}

/** Throw a single readable error if the shipped manifest would fail for a user. */
export function verifyManifest(manifest) {
    const { problems } = inspectManifest(manifest);
    if (problems.length === 0) return;
    const list = problems
        .map(({ field, name, spec, why }) => `  ${field}.${name} = "${spec}"\n      ${why}`)
        .join("\n");
    throw new Error(
        `package.json ships to users and ${problems.length} dependency specifier(s) would break their install:\n${list}\n` +
        "Pin an ordinary version range instead. This manifest is installed verbatim; there is no build step to rewrite it.",
    );
}

export const __internals = { UNSUPPORTED_PROTOCOLS, DEPENDENCY_FIELDS };
