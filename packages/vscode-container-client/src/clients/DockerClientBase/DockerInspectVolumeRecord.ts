/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as z from 'zod/mini';
import { InspectVolumesItem } from '../../contracts/ContainerClient';
import { dayjs } from '../../utils/dayjs';

export const DockerInspectVolumeRecordSchema = z.object({
    Name: z.string(),
    Driver: z.string(),
    Mountpoint: z.string(),
    Scope: z.string(),
    Labels: z.nullish(z.record(z.string(), z.string())),
    Options: z.nullish(z.record(z.string(), z.unknown())),
    CreatedAt: z.string(),
});

type DockerInspectVolumeRecord = z.infer<typeof DockerInspectVolumeRecordSchema>;

export function normalizeDockerInspectVolumeRecord(volume: DockerInspectVolumeRecord, raw: string): InspectVolumesItem {
    const createdAt = dayjs.utc(volume.CreatedAt);

    // Return the normalized InspectVolumesItem record
    return {
        name: volume.Name,
        driver: volume.Driver,
        mountpoint: volume.Mountpoint,
        scope: volume.Scope,
        labels: volume.Labels ?? {},
        options: volume.Options ?? {},
        createdAt: createdAt.toDate(),
        raw,
    };
}
