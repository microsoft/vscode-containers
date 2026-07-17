/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as z from 'zod/mini';
import type { InspectNetworksItem } from '../../contracts/ContainerClient';
import { dateStringSchema } from '../../contracts/ZodTransforms';

// Nerdctl (nerdctl) network inspect output - Docker-compatible format
const NerdctlNetworkIpamConfigSchema = z.object({
    Subnet: z.optional(z.string()),
    Gateway: z.optional(z.string()),
});

const NerdctlNetworkIpamSchema = z.object({
    Driver: z.optional(z.string()),
    Config: z.optional(z.array(NerdctlNetworkIpamConfigSchema)),
});

/**
 * Nerdctl network inspect schema with date transformation.
 */
export const NerdctlInspectNetworkRecordSchema = z.object({
    Name: z.string(),
    Id: z.optional(z.string()),
    Driver: z.optional(z.string()),
    // Date string transformed to Date object (undefined if invalid)
    Created: z.optional(dateStringSchema),
    Scope: z.optional(z.string()),
    Internal: z.optional(z.boolean()),
    EnableIPv6: z.optional(z.boolean()),
    Attachable: z.optional(z.boolean()),
    Ingress: z.optional(z.boolean()),
    Labels: z.optional(z.nullable(z.record(z.string(), z.string()))),
    IPAM: z.optional(NerdctlNetworkIpamSchema),
});

export type NerdctlInspectNetworkRecord = z.infer<typeof NerdctlInspectNetworkRecordSchema>;

/**
 * Normalize a parsed NerdctlInspectNetworkRecord to the common InspectNetworksItem format.
 * Date transformation is already done by the schema.
 */
export function normalizeNerdctlInspectNetworkRecord(network: NerdctlInspectNetworkRecord, raw: string): InspectNetworksItem {
    // Build ipam config array, keeping entries where at least one of Subnet or Gateway is defined
    const ipamConfig = (network.IPAM?.Config ?? [])
        .filter((config) => config.Subnet !== undefined || config.Gateway !== undefined)
        .map((config) => ({
            subnet: config.Subnet ?? '',
            gateway: config.Gateway ?? '',
        }));

    return {
        name: network.Name,
        id: network.Id,
        driver: network.Driver,
        createdAt: network.Created,
        scope: network.Scope,
        internal: network.Internal,
        ipv6: network.EnableIPv6,
        attachable: network.Attachable,
        ingress: network.Ingress,
        labels: network.Labels ?? {},
        ipam: network.IPAM ? {
            driver: network.IPAM.Driver || 'default',
            config: ipamConfig,
        } : undefined,
        raw,
    };
}
