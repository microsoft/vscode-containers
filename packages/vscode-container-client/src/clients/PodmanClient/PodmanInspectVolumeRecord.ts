/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { InspectVolumesItem } from "../../contracts/ContainerClient";

export type PodmanInspectVolumeRecord = {
    Name: string;
    Driver: string;
    Mountpoint: string;
    CreatedAt: string;
    Labels?: Record<string, string>;
    Scope: string;
    Options?: Record<string, unknown>;
};

export function isPodmanInspectVolumeRecord(maybeVolume: unknown): maybeVolume is PodmanInspectVolumeRecord {
    const volume = maybeVolume as PodmanInspectVolumeRecord;

    if (!volume || typeof volume !== 'object') {
        return false;
    }

    if (typeof volume.Name !== 'string') {
        return false;
    }

    if (typeof volume.Driver !== 'string') {
        return false;
    }

    if (typeof volume.Mountpoint !== 'string') {
        return false;
    }

    if (typeof volume.CreatedAt !== 'string') {
        return false;
    }

    if (volume.Labels && typeof volume.Labels !== 'object') {
        return false;
    }

    if (typeof volume.Scope !== 'string') {
        return false;
    }

    if (volume.Options && typeof volume.Options !== 'object') {
        return false;
    }

    return true;
}

export function normalizePodmanInspectVolumeRecord(volume: PodmanInspectVolumeRecord): InspectVolumesItem {
    return {
        name: volume.Name,
        driver: volume.Driver,
        mountpoint: volume.Mountpoint,
        createdAt: new Date(volume.CreatedAt),
        labels: volume.Labels || {},
        scope: volume.Scope,
        options: volume.Options || {},
        raw: JSON.stringify(volume),
    };
}
