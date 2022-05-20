/*!--------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export type PodmanVersionRecord = {
    Client: { APIVersion: string };
    Server?: { APIVersion: string };
};

export function isPodmanVersionRecord(maybeVersion: unknown): maybeVersion is PodmanVersionRecord {
    const version = maybeVersion as PodmanVersionRecord;

    if (typeof version !== 'object') {
        return false;
    }

    if (typeof version.Client !== 'object') {
        return false;
    }

    if (typeof version.Client.APIVersion !== 'string') {
        return false;
    }

    if (typeof version.Server === 'object' && typeof version.Server.APIVersion !== 'string') {
        return false;
    }

    return true;
}
