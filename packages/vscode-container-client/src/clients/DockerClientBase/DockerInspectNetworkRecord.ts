/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as z from 'zod/mini';
import { InspectNetworksItem, NetworkIpamConfig } from '../../contracts/ContainerClient';
import { dayjs } from '../../utils/dayjs';

const DockerIpamConfigSchema = z.object({
    Subnet: z.string(),
    Gateway: z.string(),
});

const DockerIpamSchema = z.object({
    Driver: z.string(),
    Config: z.optional(z.array(DockerIpamConfigSchema)),
});

export const DockerInspectNetworkRecordSchema = z.object({
    Id: z.string(),
    Name: z.string(),
    Driver: z.string(),
    Scope: z.string(),
    Labels: z.record(z.string(), z.string()),
    IPAM: DockerIpamSchema,
    EnableIPv6: z.boolean(),
    Internal: z.boolean(),
    Attachable: z.boolean(),
    Ingress: z.boolean(),
    Created: z.string(),
});

type DockerInspectNetworkRecord = z.infer<typeof DockerInspectNetworkRecordSchema>;

export function normalizeDockerInspectNetworkRecord(network: DockerInspectNetworkRecord, raw: string): InspectNetworksItem {
    const ipam: NetworkIpamConfig = {
        driver: network.IPAM.Driver,
        config: network.IPAM.Config?.map(({ Subnet, Gateway }) => ({ // eslint-disable-line @typescript-eslint/naming-convention
            subnet: Subnet,
            gateway: Gateway,
        })) ?? [],
    };

    const createdAt = dayjs.utc(network.Created).toDate();

    // Return the normalized InspectNetworksItem record
    return {
        id: network.Id,
        name: network.Name,
        driver: network.Driver,
        scope: network.Scope,
        labels: network.Labels || {},
        ipam,
        ipv6: network.EnableIPv6,
        internal: network.Internal,
        attachable: network.Attachable,
        ingress: network.Ingress,
        createdAt,
        raw,
    };
}
