/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as z from 'zod/mini';
import type { ListVolumeItem } from '../../contracts/ContainerClient';

// `wslc volume list --format json` emits a trimmed shape — only Name and Driver
// have been observed. Keep this permissive so an additional field appearing in
// a later wslc release does not break parsing.
export const WslcListVolumeRecordSchema = z.object({
    Name: z.string(),
    Driver: z.optional(z.string()),
    Mountpoint: z.optional(z.string()),
    Labels: z.nullish(z.record(z.string(), z.string())),
    Scope: z.optional(z.string()),
    CreatedAt: z.optional(z.string()),
});

type WslcListVolumeRecord = z.infer<typeof WslcListVolumeRecordSchema>;

export function normalizeWslcListVolumeRecord(volume: WslcListVolumeRecord): ListVolumeItem {
    return {
        name: volume.Name,
        driver: volume.Driver ?? '',
        labels: volume.Labels ?? {},
        mountpoint: volume.Mountpoint ?? '',
        scope: volume.Scope ?? 'local',
        createdAt: volume.CreatedAt ? new Date(volume.CreatedAt) : undefined,
        size: undefined,
    };
}
