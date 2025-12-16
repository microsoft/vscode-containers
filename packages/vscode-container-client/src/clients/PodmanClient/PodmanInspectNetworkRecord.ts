/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { z } from 'zod/v4';
import { InspectNetworksItem } from '../../contracts/ContainerClient';

export const PodmanInspectNetworkRecordSchema = z.object({
    id: z.string().optional(), // Not in v3
    driver: z.string().optional(), // Not in v3
    created: z.string().optional(), // Not in v3
    // eslint-disable-next-line @typescript-eslint/naming-convention
    ipv6_enabled: z.boolean().optional(), // Not in v3
    internal: z.boolean().optional(), // Not in v3
    name: z.string(),
    labels: z.record(z.string(), z.string()).optional().nullable(),
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
