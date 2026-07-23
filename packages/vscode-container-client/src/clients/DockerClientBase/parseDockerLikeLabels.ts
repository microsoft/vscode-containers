/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { Labels } from "../../contracts/ContainerClient";
import { parseLabelsString } from "../../contracts/ZodTransforms";

/**
 * Parse Docker-like label string
 * @param rawLabels Comma separated string of labels
 * @returns A {@link Labels} record
 *
 * Thin wrapper that delegates to {@link parseLabelsString} so the schema
 * transforms in `contracts/ZodTransforms` and this client helper share a single
 * implementation.
 */
export function parseDockerLikeLabels(rawLabels: string): Labels {
    return parseLabelsString(rawLabels);
}
