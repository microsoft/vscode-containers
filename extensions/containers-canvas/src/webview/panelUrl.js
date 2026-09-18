/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// The panel's capability token.
//
// Each canvas instance serves on its own loopback port, and the host opens the
// panel at a URL carrying a token minted when that server started. Everything
// the panel calls afterwards presents it.
//
// The token travels in the URL *fragment* rather than the query string. A
// fragment is never sent to a server, never appears in an access log or a
// `Referer` header, and is not part of the request line the host records when
// it reports which URL a panel is showing. The same value still has to reach
// the server on each call, so it is added to the query string of those
// same-origin requests -- but only there, and only from inside the page.
//
// This is defence in depth rather than authentication. A local process that can
// reach the port can usually reach the container runtime directly, so the
// honest claim is that this raises the cost of a port scan. The check that
// actually keeps web pages out is the origin guard on the server.
//
// Static assets are deliberately exempt from the check: they are this bundle,
// they carry no container data, and a fragment is not readable by the server on
// the very first request anyway.

/**
 * Read the token from the current location.
 *
 * Deliberately a function rather than a module-level constant: read once at
 * import time it could not be exercised in a test or mocked, which made the one
 * piece of plumbing shared by every endpoint the one piece with no coverage.
 *
 * @param {{hash?: string, search?: string}} [loc] defaults to `window.location`
 */
export function readToken(loc) {
    const source = loc ?? (typeof window === "undefined" ? {} : window.location);
    const hash = String(source.hash ?? "").replace(/^#/, "");
    const fromHash = new URLSearchParams(hash).get("t");
    if (fromHash) return fromHash;
    // Query string fallback: older panels, and anything that re-opens the URL
    // without the fragment intact.
    return new URLSearchParams(String(source.search ?? "")).get("t") ?? "";
}

/**
 * Add the token to a same-origin panel URL.
 *
 * Every caller goes through here so a new endpoint cannot quietly skip it --
 * forgetting one produces a 403 at runtime rather than a hole, but only for
 * whoever opens that view.
 */
export function panelUrl(pathname, params = {}, loc) {
    const base = loc ?? (typeof window === "undefined" ? "http://127.0.0.1/" : window.location.href);
    const url = new URL(pathname, typeof base === "string" ? base : base.href);
    for (const [key, value] of Object.entries(params)) {
        if (value !== undefined && value !== null) url.searchParams.set(key, String(value));
    }
    const token = readToken(typeof base === "string" ? undefined : loc);
    if (token) url.searchParams.set("t", token);
    // A fragment on an API request would be dead weight; strip whatever the
    // page's own URL contributed.
    url.hash = "";
    return url;
}

/** Same, as a string, for `fetch` and `EventSource`. */
export const panelHref = (pathname, params, loc) => panelUrl(pathname, params, loc).toString();
