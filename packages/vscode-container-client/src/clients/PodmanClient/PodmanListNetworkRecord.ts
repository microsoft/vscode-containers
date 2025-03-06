/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export type PodmanListNetworkRecord = {
    Name?: string; // v3
    name?: string; // Not in v3
    id?: string; // Not in v3
    driver?: string; // Not in v3
    created?: string; // Not in v3
    // eslint-disable-next-line @typescript-eslint/naming-convention
    ipv6_enabled?: boolean; // Not in v3
    internal?: boolean; // Not in v3
    Labels?: Record<string, string>; // v3
    labels?: Record<string, string>; // Maybe in v4?
};

export function isPodmanListNetworkRecord(maybeNetwork: unknown): maybeNetwork is PodmanListNetworkRecord {
    const network = maybeNetwork as PodmanListNetworkRecord;

    if (!network || typeof network !== 'object') {
        return false;
    }

    if (typeof network.Name !== 'string' && typeof network.name !== 'string') {
        return false;
    }

    return true;
}
