/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as z from 'zod/mini';
import type { ListNetworkItem } from '../../contracts/ContainerClient';
import { booleanStringSchema, dateStringSchema, labelsStringSchema } from '../../contracts/ZodTransforms';

/**
 * A single, tolerant schema for the Docker-compatible `network ls` output
 * emitted by Docker and nerdctl. Docker emits every field as a string; nerdctl
 * may omit some. Booleans (`IPv6`/`Internal`), labels, and the creation date are
 * normalized by the shared field transforms so the schema does the conversion
 * once for both runtimes.
 *
 * Podman's `network ls` output is object-shaped and versioned, so it keeps its
 * own record module rather than sharing this schema.
 */
export const SharedListNetworkRecordSchema = z.object({
    ID: z.optional(z.string()),
    Name: z.string(),
    Driver: z.optional(z.string()),
    Scope: z.optional(z.string()),
    // "true"/"false" strings transformed to booleans. Wrapped in `z.catch` so an
    // empty or unrecognized value falls back to `false` (matching the previous
    // `=== 'true'` comparison) instead of failing the whole network record.
    IPv6: z.optional(z.catch(booleanStringSchema, false)),
    Internal: z.optional(z.catch(booleanStringSchema, false)),
    // "key=value,key2=value2" string transformed to a record
    Labels: z.optional(labelsStringSchema),
    // Date string transformed to Date | undefined
    CreatedAt: z.optional(dateStringSchema),
});

export type SharedListNetworkRecord = z.infer<typeof SharedListNetworkRecordSchema>;

/**
 * Normalize a parsed {@link SharedListNetworkRecord} to the common
 * {@link ListNetworkItem}. Booleans, labels, and the creation date are already
 * normalized by the schema transforms.
 */
export function normalizeListNetworkRecord(network: SharedListNetworkRecord): ListNetworkItem {
    return {
        id: network.ID,
        name: network.Name,
        driver: network.Driver,
        scope: network.Scope,
        internal: network.Internal ?? false,
        ipv6: network.IPv6 ?? false,
        labels: network.Labels ?? {},
        createdAt: network.CreatedAt,
    };
}
