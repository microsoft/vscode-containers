/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { LabelFilters, Labels } from "../../contracts/ContainerClient";

/**
 * Client-side counterpart of {@link withDockerLabelFilterArgs}. Some runtimes (e.g. `wslc`) have
 * `list` verbs that accept no `--filter` flag, so label filters can't be pushed to the CLI. Such
 * clients can apply the same filtering to the parsed records with this predicate so callers still
 * get a correctly-scoped list instead of an over-broad one.
 *
 * Semantics mirror {@link withDockerLabelFilterArgs}: a `true` value requires the label key to be
 * present (with any value); a non-empty string value requires an exact `key=value` match. Any other
 * value (e.g. `false` or an empty string) contributes no constraint, matching how the server-side
 * arg builder omits those entries.
 */
export function matchesLabelFilters(labels: Labels, filters: LabelFilters | undefined): boolean {
    for (const [name, value] of Object.entries(filters ?? {})) {
        if (value === true) {
            if (!(name in labels)) {
                return false;
            }
        } else if (typeof value === 'string' && value !== '') {
            if (labels[name] !== value) {
                return false;
            }
        }
    }

    return true;
}
