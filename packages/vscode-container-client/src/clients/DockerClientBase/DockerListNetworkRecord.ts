/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { z } from 'zod/v4';
import { ListNetworkItem } from '../../contracts/ContainerClient';
import { dayjs } from '../../utils/dayjs';
import { parseDockerLikeLabels } from './parseDockerLikeLabels';

export const DockerListNetworkRecordSchema = z.object({
    ID: z.string(),
    Name: z.string(),
    Driver: z.string(),
    Labels: z.string(),
    Scope: z.string(),
    IPv6: z.string(),
    CreatedAt: z.string(),
    Internal: z.string(),
});

type DockerListNetworkRecord = z.infer<typeof DockerListNetworkRecordSchema>;

export function normalizeDockerListNetworkRecord(network: DockerListNetworkRecord): ListNetworkItem {
    // Parse the labels assigned to the networks and normalize to key value pairs
    const labels = parseDockerLikeLabels(network.Labels);

    const createdAt = dayjs.utc(network.CreatedAt).toDate();

    return {
        id: network.ID,
        name: network.Name,
        driver: network.Driver,
        labels,
        scope: network.Scope,
        ipv6: network.IPv6.toLowerCase() === 'true',
        internal: network.Internal.toLowerCase() === 'true',
        createdAt,
    };
}
