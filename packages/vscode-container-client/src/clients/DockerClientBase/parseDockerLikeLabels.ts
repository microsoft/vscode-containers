/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Labels } from "../../contracts/ContainerClient";

/**
 * Parse Docker-like label string
 * @param rawLabels Comma seperated string of labels
 * @returns A {@link Labels} record
 */
export function parseDockerLikeLabels(rawLabels: string): Labels {
    const labels: Labels = {};
    let lastKey: string | undefined;

    for (const fragment of rawLabels.split(',')) {
        const index = fragment.indexOf('=');

        if (index < 0) {
            // No '=' means this fragment is a continuation of the previous label's
            // value, which itself contained a comma (e.g. multiple compose config
            // files in `com.docker.compose.project.config_files`). `docker ... ls`
            // joins labels with commas and does not escape commas inside values, so
            // we stitch the value back together here.
            if (lastKey !== undefined) {
                labels[lastKey] += `,${fragment}`;
            }
            continue;
        }

        lastKey = fragment.substring(0, index);
        labels[lastKey] = fragment.substring(index + 1);
    }

    return labels;
}
