/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { InspectNetworksItem } from "../../contracts/ContainerClient";

export type PodmanInspectNetworkRecord = {
    id?: string; // Not in v3
    driver?: string; // Not in v3
    created?: string; // Not in v3
    // eslint-disable-next-line @typescript-eslint/naming-convention
    ipv6_enabled?: boolean; // Not in v3
    internal?: boolean; // Not in v3
    name: string;
    labels?: Record<string, string>;
};

export function isPodmanInspectNetworkRecord(maybeNetwork: unknown): maybeNetwork is PodmanInspectNetworkRecord {
    const network = maybeNetwork as PodmanInspectNetworkRecord;

    if (!network || typeof network !== 'object') {
        return false;
    }

    if (typeof network.name !== 'string') {
        return false;
    }

    if (network.labels && typeof network.labels !== 'object') {
        return false;
    }

    return true;
}

export function normalizePodmanInspectNetworkRecord(network: PodmanInspectNetworkRecord): InspectNetworksItem {
    return {
        name: network.name,
        id: network.id,
        driver: network.driver,
        createdAt: network.created ? new Date(network.created) : undefined,
        internal: network.internal,
        ipv6: network.ipv6_enabled,
        labels: network.labels || {},
        scope: undefined,
        attachable: undefined,
        ingress: undefined,
        ipam: undefined,
        raw: JSON.stringify(network),
    };
}
