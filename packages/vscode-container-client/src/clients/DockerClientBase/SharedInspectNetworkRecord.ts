/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as z from 'zod/mini';
import type { InspectNetworksItem, ListNetworkItem } from '../../contracts/ContainerClient';
import { dateStringOrEpochSchema } from '../../contracts/ZodTransforms';

/**
 * A single, tolerant schema for the Docker-compatible network `inspect` output
 * emitted by Docker, nerdctl, and wslc. Docker emits every field; nerdctl and
 * wslc may omit most of them, so they are modeled as optional and backfilled by
 * the normalizer.
 *
 * `wslc network list` emits this same inspect-style shape rather than Docker's
 * flat `network ls` shape, so it shares this schema (via
 * {@link normalizeInspectNetworkRecordAsListItem}) instead of
 * `SharedListNetworkRecordSchema`.
 *
 * Podman's `network inspect` uses a drastically different, lower-cased shape
 * (`name`/`id`/`created`/`ipv6_enabled`, no IPAM/scope/attachable/ingress) and
 * therefore keeps its own record module rather than sharing this schema.
 */
const NetworkIpamConfigSchema = z.object({
    Subnet: z.optional(z.string()),
    Gateway: z.optional(z.string()),
});

const NetworkIpamSchema = z.object({
    Driver: z.optional(z.string()),
    Config: z.optional(z.nullable(z.array(NetworkIpamConfigSchema))),
});

export const SharedInspectNetworkRecordSchema = z.object({
    Name: z.string(),
    Id: z.optional(z.string()),
    Driver: z.optional(z.string()),
    // Date string (or, for wslc, a Unix epoch in seconds) transformed to Date | undefined
    Created: z.optional(dateStringOrEpochSchema),
    Scope: z.optional(z.string()),
    Internal: z.optional(z.boolean()),
    EnableIPv6: z.optional(z.boolean()),
    Attachable: z.optional(z.boolean()),
    Ingress: z.optional(z.boolean()),
    Labels: z.optional(z.nullable(z.record(z.string(), z.string()))),
    IPAM: z.optional(NetworkIpamSchema),
});

export type SharedInspectNetworkRecord = z.infer<typeof SharedInspectNetworkRecordSchema>;

/**
 * Normalize a parsed {@link SharedInspectNetworkRecord} to the common
 * {@link InspectNetworksItem}. The creation date is already parsed by the schema.
 */
export function normalizeInspectNetworkRecord(network: SharedInspectNetworkRecord, raw: string): InspectNetworksItem {
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

/**
 * Normalize a parsed {@link SharedInspectNetworkRecord} to the common
 * {@link ListNetworkItem}. Used by runtimes (wslc) whose `network list` emits the
 * inspect-style object shape rather than Docker's flat `network ls` shape.
 */
export function normalizeInspectNetworkRecordAsListItem(network: SharedInspectNetworkRecord): ListNetworkItem {
    return {
        id: network.Id,
        name: network.Name,
        driver: network.Driver,
        scope: network.Scope,
        labels: network.Labels ?? {},
        ipv6: network.EnableIPv6,
        internal: network.Internal,
        createdAt: network.Created,
    };
}
