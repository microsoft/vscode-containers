/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export type PodmanListContainerRecord = {
    Id: string;
    Names: Array<string>;
    Image: string;
    Ports?: Array<PodmanPortBinding>;
    Networks?: string[];
    Labels?: Record<string, string>;
    Created: number;
    State: string;
    Status: string;
};

type PodmanPortBinding = {
    /* eslint-disable @typescript-eslint/naming-convention */
    host_ip?: string;
    container_port: number;
    host_port?: number;
    protocol: 'udp' | 'tcp';
    /* eslint-enable @typescript-eslint/naming-convention */
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function isPodmanListContainerRecord(maybeContainer: any): maybeContainer is PodmanListContainerRecord {
    if (!maybeContainer || typeof maybeContainer !== 'object') {
        return false;
    }

    if (typeof maybeContainer.Id !== 'string') {
        return false;
    }

    if (!!maybeContainer.Names && !Array.isArray(maybeContainer.Names)) {
        return false;
    }

    if (typeof maybeContainer.Image !== 'string') {
        return false;
    }

    if (typeof maybeContainer.Created !== 'number') {
        return false;
    }

    if (typeof maybeContainer.State !== 'string') {
        return false;
    }

    if (typeof maybeContainer.Status !== 'string') {
        return false;
    }

    return true;
}
