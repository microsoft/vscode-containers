/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { LabelFilters, Labels } from "../../contracts/ContainerClient";
import { matchesLabelFilters } from "./matchesLabelFilters";

/**
 * Client-side label/driver filtering for runtimes (e.g. `wslc`) whose `volume list` and
 * `network list` verbs accept no `--filter` flag. Both list shapes expose `labels` and an
 * optional `driver`, so they share one predicate.
 *
 * @param items The parsed list items
 * @param filters The requested label and driver filters
 * @returns The items matching every requested filter
 */
export function filterByLabelsAndDriver<T extends { labels: Labels, driver?: string }>(
    items: Array<T>,
    filters: { labels?: LabelFilters, driver?: string },
): Array<T> {
    return items.filter((item) =>
        matchesLabelFilters(item.labels, filters.labels) &&
        (!filters.driver || item.driver === filters.driver));
}
