/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Expected JSON format for volume records from podman
export type PodmanVolumeRecord = {
    Name: string;
    Driver: string;
    Labels: Record<string, string>;
    Mountpoint: string;
    Scope: string;
};

export function isPodmanVolumeRecord(maybeVolume: unknown): maybeVolume is PodmanVolumeRecord {
    const volume = maybeVolume as PodmanVolumeRecord;

    if (!volume || typeof volume !== 'object') {
        return false;
    }

    if (typeof volume.Name !== 'string') {
        return false;
    }

    if (typeof volume.Driver !== 'string') {
        return false;
    }

    if (!volume.Labels || typeof volume.Labels !== 'object') {
        return false;
    }

    if (typeof volume.Mountpoint !== 'string') {
        return false;
    }

    if (typeof volume.Scope !== 'string') {
        return false;
    }

    return true;
}
