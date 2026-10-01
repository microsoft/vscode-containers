/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Shapes `loadState` output for the agent's `list` action.
//
// Kept separate from `extension.mjs` because that module joins the Copilot
// session on import and so cannot be exercised in a test.
//
// The rule it exists to enforce: a failed read must never be reported as an
// empty inventory. `loadState` substitutes `[]` for any list it could not
// fetch, so "no containers" and "asking Docker failed" arrive here looking
// identical. Reporting a count of 0 for the second case tells Copilot something
// untrue, and it will happily relay that to the user.

/** A list that could not be read, distinguishable from one that was empty. */
function unavailable(reason) {
    return { unavailable: true, reason };
}

/**
 * @param state  A `loadState` result.
 * @param kind   "containers" | "images" | "all"
 * @param limit  Max rows per list.
 */
export function summariseState(state, { kind = "all", limit = 50 } = {}) {
    const listErrors = state?.listErrors ?? { containers: null, images: null };
    const wantContainers = kind !== "images";
    const wantImages = kind !== "containers";

    const runtime = state?.runtime
        ? {
            name: state.runtime.bin,
            version: state.runtime.version,
            // Without this the agent cannot tell a working empty host from a
            // runtime that is installed but not answering.
            available: state.runtime.available !== false,
        }
        : null;

    const summary = {
        runtime,
        // Present whenever anything went wrong, so the agent leads with the
        // failure instead of with a count.
        error: state?.error ?? null,
        counts: {},
    };

    if (wantContainers) {
        if (listErrors.containers) {
            summary.counts.containers = null;
            summary.containers = unavailable(listErrors.containers);
        } else {
            summary.counts.containers = state.containers.length;
            summary.containers = state.containers.slice(0, limit);
        }
    }

    if (wantImages) {
        if (listErrors.images) {
            summary.counts.images = null;
            summary.images = unavailable(listErrors.images);
        } else {
            summary.counts.images = state.images.length;
            summary.images = state.images.slice(0, limit);
        }
    }

    return summary;
}
