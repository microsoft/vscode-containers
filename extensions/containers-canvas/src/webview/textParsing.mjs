/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Pure string parsing shared by the webview components.
//
// Kept out of the `.jsx` files so it can be imported by the test runner, which
// cannot parse JSX. These are all functions that were wrong in ways no amount
// of clicking would reliably reveal, so they are worth pinning down directly.

/**
 * Decide what a viewer should render for some text.
 *
 * Returns the parsed root for a JSON tree, or null to fall back to plain text.
 *
 * `inspect` opts into unwrapping a single-element array, which is the shape
 * `docker inspect` always returns. It is off by default because the file
 * browser shows arbitrary user files through the same viewer, and there a
 * one-element array is real content -- `[{"enabled":true}]` was being displayed
 * as a bare object, silently misrepresenting the file.
 */
export function parseJsonRoot(text, { language = "json", inspect = false } = {}) {
    if (language !== "json") return null;
    const trimmed = String(text ?? "").trim();
    if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return null;
    try {
        const v = JSON.parse(trimmed);
        // A bare number, string or null is not a tree; plain text reads better.
        if (v === null || typeof v !== "object") return null;
        if (inspect && Array.isArray(v) && v.length === 1 && v[0] && typeof v[0] === "object") {
            return v[0];
        }
        return v;
    } catch {
        return null;
    }
}

/**
 * Split a typed command into argv.
 *
 * Quotes are honoured so `echo "a b"` is two arguments, but nothing else is:
 * there is no shell here, so `|`, `>` and `;` are ordinary characters.
 *
 * Scanned character by character rather than matched with one regex. The
 * alternation this replaced could not join a quoted segment to the unquoted one
 * touching it, so `--label="hello world"` came out as `--label="hello` and
 * `world"` -- three arguments instead of two, with the quotes left in.
 */
export function splitArgv(text) {
    const out = [];
    let current = "";
    // Distinct from `current !== ""`, so an explicit `''` yields an empty
    // argument instead of disappearing.
    let inToken = false;
    let quote = null;

    for (const ch of String(text ?? "")) {
        if (quote) {
            if (ch === quote) quote = null;
            else current += ch;
            continue;
        }
        if (ch === '"' || ch === "'") {
            quote = ch;
            inToken = true;
            continue;
        }
        if (/\s/.test(ch)) {
            if (inToken) {
                out.push(current);
                current = "";
                inToken = false;
            }
            continue;
        }
        current += ch;
        inToken = true;
    }
    // An unterminated quote still yields what was typed, rather than nothing.
    if (inToken) out.push(current);
    return out;
}

/**
 * A SLSA configSource uri is `<repo>#<commit>:<subdir>`. Split it so the commit
 * and path are readable instead of buried in one long string.
 */
export function splitSourceUri(uri) {
    const hash = String(uri ?? "").indexOf("#");
    if (hash === -1) return { repo: uri, commit: null, subdir: null };
    const repo = uri.slice(0, hash);
    const rest = uri.slice(hash + 1);
    const colon = rest.indexOf(":");
    return colon === -1
        ? { repo, commit: rest, subdir: null }
        : { repo, commit: rest.slice(0, colon), subdir: rest.slice(colon + 1) };
}

/**
 * `owner/repo` for a GitHub source uri, or null.
 *
 * The repository segment is taken whole and only a trailing `.git` is removed.
 * Excluding dots from it truncated `org/service.api` to `org/service`, which
 * links to a different repository -- or to one that does not exist.
 */
export function githubRepo(repo) {
    const m = /^https?:\/\/github\.com\/([^/?#]+)\/([^/?#]+)/.exec(String(repo ?? ""));
    if (!m) return null;
    const name = m[2].replace(/\.git$/, "");
    return name ? `${m[1]}/${name}` : null;
}

/**
 * A browsable URL for the recorded source, when the host is one we can link.
 *
 * `revision` carries the commit when the uri has no `#fragment`, which is the
 * normal shape for an OCI `image.source` label. Ignoring it meant a known
 * commit produced no link at all.
 */
export function browseUrl(uri, entryPoint, revision = null) {
    const { repo, commit, subdir } = splitSourceUri(uri);
    const gh = githubRepo(repo);
    const at = commit ?? revision;
    if (!gh || !at) return null;
    const path = [subdir, entryPoint].filter(Boolean).join("/");
    return `https://github.com/${gh}/blob/${at}/${path || "Dockerfile"}`;
}
