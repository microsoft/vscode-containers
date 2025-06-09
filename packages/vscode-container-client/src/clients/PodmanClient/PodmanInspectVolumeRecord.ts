/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { z } from 'zod/v4';
import { InspectVolumesItem } from '../../contracts/ContainerClient';

export const PodmanInspectVolumeRecordSchema = z.object({
    Name: z.string(),
    Driver: z.string(),
    Mountpoint: z.string(),
    CreatedAt: z.string(),
    Labels: z.record(z.string(), z.string()).optional(),
    Scope: z.string(),
    Options: z.record(z.string(), z.unknown()).optional(),
});

type PodmanInspectVolumeRecord = z.infer<typeof PodmanInspectVolumeRecordSchema>;

export function normalizePodmanInspectVolumeRecord(volume: PodmanInspectVolumeRecord, raw: string): InspectVolumesItem {
    return {
        name: volume.Name,
        driver: volume.Driver,
        mountpoint: volume.Mountpoint,
        createdAt: new Date(volume.CreatedAt),
        labels: volume.Labels || {},
        scope: volume.Scope,
        options: volume.Options || {},
        raw,
    };
}
