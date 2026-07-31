/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as z from 'zod/mini';
import type { InspectNetworksItem, ListNetworkItem, NetworkIpamConfig } from '../../contracts/ContainerClient';

const WslcNetworkIpamConfigSchema = z.object({
    Subnet: z.optional(z.string()),
    Gateway: z.optional(z.string()),
});

const WslcNetworkIpamSchema = z.object({
    Driver: z.optional(z.string()),
    Config: z.nullish(z.array(WslcNetworkIpamConfigSchema)),
});

/**
 * Forgiving schema for wslc network records emitted by both
 * `wslc network list --format json` and `wslc inspect --type network`.
 * Field shapes are not fully documented yet so almost everything is optional.
 */
export const WslcNetworkRecordSchema = z.object({
    Id: z.optional(z.string()),
    Name: z.string(),
    Driver: z.optional(z.string()),
    Scope: z.optional(z.string()),
    Labels: z.nullish(z.record(z.string(), z.string())),
    IPAM: z.optional(WslcNetworkIpamSchema),
    EnableIPv6: z.optional(z.boolean()),
    Internal: z.optional(z.boolean()),
    Attachable: z.optional(z.boolean()),
    Ingress: z.optional(z.boolean()),
    // wslc may emit either an ISO-8601 string or a Unix epoch (seconds).
    Created: z.optional(z.union([z.string(), z.number()])),
});

export type WslcNetworkRecord = z.infer<typeof WslcNetworkRecordSchema>;

function parseCreated(value: WslcNetworkRecord['Created']): Date | undefined {
    if (value === undefined || value === null) {
        return undefined;
    }
    if (typeof value === 'number') {
        // wslc emits seconds since epoch for some records (consistent with images)
        return new Date(value * 1000);
    }
    const d = new Date(value);
    return isNaN(d.getTime()) ? undefined : d;
}

export function normalizeWslcInspectNetworkRecord(network: WslcNetworkRecord, raw: string): InspectNetworksItem {
    const ipam: NetworkIpamConfig | undefined = network.IPAM
        ? {
            driver: network.IPAM.Driver ?? '',
            config: (network.IPAM.Config ?? [])
                .filter((c): c is { Subnet: string; Gateway: string } => !!c.Subnet && !!c.Gateway)
                .map(c => ({ subnet: c.Subnet, gateway: c.Gateway })),
        }
        : undefined;

    return {
        id: network.Id,
        name: network.Name,
        driver: network.Driver,
        scope: network.Scope,
        labels: network.Labels ?? {},
        ipam,
        ipv6: network.EnableIPv6,
        internal: network.Internal,
        attachable: network.Attachable,
        ingress: network.Ingress,
        createdAt: parseCreated(network.Created),
        raw,
    };
}

export function normalizeWslcListNetworkRecord(network: WslcNetworkRecord): ListNetworkItem {
    return {
        id: network.Id,
        name: network.Name,
        driver: network.Driver,
        labels: network.Labels ?? {},
        scope: network.Scope,
        ipv6: network.EnableIPv6,
        internal: network.Internal,
        createdAt: parseCreated(network.Created),
    };
}
