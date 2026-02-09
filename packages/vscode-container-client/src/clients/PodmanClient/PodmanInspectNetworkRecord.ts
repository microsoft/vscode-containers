/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as z from 'zod/mini';
import { InspectNetworksItem } from '../../contracts/ContainerClient';

export const PodmanInspectNetworkRecordSchema = z.object({
    id: z.optional(z.string()), // Not in v3
    driver: z.optional(z.string()), // Not in v3
    created: z.optional(z.string()), // Not in v3
    // eslint-disable-next-line @typescript-eslint/naming-convention
    ipv6_enabled: z.optional(z.boolean()), // Not in v3
    internal: z.optional(z.boolean()), // Not in v3
    name: z.string(),
    labels: z.nullish(z.record(z.string(), z.string())),
});

type PodmanInspectNetworkRecord = z.infer<typeof PodmanInspectNetworkRecordSchema>;

export function normalizePodmanInspectNetworkRecord(network: PodmanInspectNetworkRecord, raw: string): InspectNetworksItem {
    return {
        name: network.name,
        id: network.id,
        driver: network.driver,
        createdAt: network.created ? new Date(network.created) : undefined,
        internal: network.internal,
        ipv6: network.ipv6_enabled,
        labels: network.labels ?? {},
        scope: undefined,
        attachable: undefined,
        ingress: undefined,
        ipam: undefined,
        raw,
    };
}
