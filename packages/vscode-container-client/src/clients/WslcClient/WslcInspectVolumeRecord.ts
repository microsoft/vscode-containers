/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as z from 'zod/mini';
import type { InspectVolumesItem } from '../../contracts/ContainerClient';

export const WslcInspectVolumeRecordSchema = z.object({
    Name: z.string(),
    Driver: z.optional(z.string()),
    Mountpoint: z.optional(z.string()),
    CreatedAt: z.optional(z.string()),
    Labels: z.nullish(z.record(z.string(), z.string())),
    Scope: z.optional(z.string()),
    DriverOpts: z.nullish(z.record(z.string(), z.unknown())),
    Status: z.nullish(z.record(z.string(), z.unknown())),
});

type WslcInspectVolumeRecord = z.infer<typeof WslcInspectVolumeRecordSchema>;

export function normalizeWslcInspectVolumeRecord(volume: WslcInspectVolumeRecord, raw: string): InspectVolumesItem {
    return {
        name: volume.Name,
        driver: volume.Driver ?? '',
        mountpoint: volume.Mountpoint ?? '',
        createdAt: volume.CreatedAt ? new Date(volume.CreatedAt) : new Date(0),
        labels: volume.Labels ?? {},
        scope: volume.Scope ?? 'local',
        options: (volume.DriverOpts as Record<string, unknown> | undefined) ?? {},
        raw,
    };
}
