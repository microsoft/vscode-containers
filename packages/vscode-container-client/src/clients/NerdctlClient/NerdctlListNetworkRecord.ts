/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as z from 'zod/mini';
import { ListNetworkItem } from '../../contracts/ContainerClient';
import { booleanStringSchema, dateStringSchema, labelsStringSchema } from '../../contracts/ZodTransforms';

/**
 * Nerdctl (nerdctl) network list output - Docker-compatible format.
 * Transforms are applied during parsing to convert string values to proper types.
 */
export const NerdctlListNetworkRecordSchema = z.object({
    ID: z.optional(z.string()),
    Name: z.string(),
    Driver: z.optional(z.string()),
    Scope: z.optional(z.string()),
    // nerdctl outputs booleans as "true"/"false" strings - transform during parsing
    IPv6: z.optional(booleanStringSchema),
    Internal: z.optional(booleanStringSchema),
    // Labels come as "key=value,key2=value2" string - transform to Record
    Labels: z.optional(labelsStringSchema),
    // Date string transformed to Date object
    CreatedAt: z.optional(dateStringSchema),
});

export type NerdctlListNetworkRecord = z.infer<typeof NerdctlListNetworkRecordSchema>;

/**
 * Normalize a parsed NerdctlListNetworkRecord to the common ListNetworkItem format.
 * Most transformations are already done by the schema.
 */
export function normalizeNerdctlListNetworkRecord(network: NerdctlListNetworkRecord): ListNetworkItem {
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
