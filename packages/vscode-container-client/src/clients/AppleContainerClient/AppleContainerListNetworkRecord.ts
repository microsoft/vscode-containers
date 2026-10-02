/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as z from 'zod/mini';
import type { InspectNetworksItem, ListNetworkItem } from '../../contracts/ContainerClient';
import { dateStringWithFallbackSchema } from '../../contracts/ZodTransforms';

/**
 * `container network list --format json` and `container network inspect <names>` emit the
 * identical nested shape (captured against real CLI 1.2.0 output): `{configuration: {name,
 * mode, plugin, labels, options, creationDate}, id, status: {ipv4Gateway, ipv4Subnet,
 * ipv6Subnet}}`. There is no flat `Name`/`Driver`/`IPAM` record to reuse from
 * `SharedListNetworkRecordSchema`/`SharedInspectNetworkRecordSchema`, so this keeps its own
 * module and is shared by both commands, same as the container/image records.
 *
 * `mode` is `"nat"` for a normal network and `"hostOnly"` for one created with `--internal`
 * (confirmed: `network create --internal` produces `mode: "hostOnly"`); there is no separate
 * boolean field for it.
 */
export const AppleContainerListNetworkRecordSchema = z.object({
    id: z.string(),
    configuration: z.object({
        name: z.optional(z.string()),
        mode: z.optional(z.string()),
        plugin: z.optional(z.string()),
        labels: z.optional(z.record(z.string(), z.string())),
        creationDate: z.optional(dateStringWithFallbackSchema),
    }),
    status: z.optional(z.object({
        ipv4Gateway: z.optional(z.string()),
        ipv4Subnet: z.optional(z.string()),
        ipv6Subnet: z.optional(z.string()),
    })),
});

export type AppleContainerListNetworkRecord = z.infer<typeof AppleContainerListNetworkRecordSchema>;

/**
 * Normalize a parsed {@link AppleContainerListNetworkRecord} to the common
 * {@link ListNetworkItem}.
 */
export function normalizeAppleContainerListNetworkRecord(network: AppleContainerListNetworkRecord): ListNetworkItem {
    return {
        name: network.configuration.name ?? network.id,
        id: network.id,
        // `plugin` (e.g. `container-network-vmnet`) is the closest equivalent to Docker's
        // network driver name.
        driver: network.configuration.plugin,
        labels: network.configuration.labels ?? {},
        scope: 'local',
        ipv6: !!network.status?.ipv6Subnet,
        createdAt: network.configuration.creationDate,
        internal: network.configuration.mode === 'hostOnly',
    };
}

/**
 * Normalize a parsed {@link AppleContainerListNetworkRecord} to the common
 * {@link InspectNetworksItem}.
 */
export function normalizeAppleContainerInspectNetworkRecord(network: AppleContainerListNetworkRecord, raw: string): InspectNetworksItem {
    const ipv4Subnet = network.status?.ipv4Subnet;
    const ipv4Gateway = network.status?.ipv4Gateway;

    return {
        name: network.configuration.name ?? network.id,
        id: network.id,
        driver: network.configuration.plugin,
        labels: network.configuration.labels ?? {},
        scope: 'local',
        // No IPAM driver name is reported for this runtime; 'default' matches the fallback
        // SharedInspectNetworkRecord uses for the same case.
        ipam: (ipv4Subnet || ipv4Gateway) ? { driver: 'default', config: [{ subnet: ipv4Subnet ?? '', gateway: ipv4Gateway ?? '' }] } : undefined,
        ipv6: !!network.status?.ipv6Subnet,
        internal: network.configuration.mode === 'hostOnly',
        attachable: undefined,
        ingress: undefined,
        createdAt: network.configuration.creationDate,
        raw,
    };
}
