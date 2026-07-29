/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as z from 'zod/mini';
import type { ListVolumeItem } from '../../contracts/ContainerClient';
import { dayjs } from '../../utils/dayjs';
import { parseDockerLikeLabels } from './parseDockerLikeLabels';
import { tryParseSize } from './tryParseSize';

export const DockerVolumeRecordSchema = z.object({
    Name: z.string(),
    Driver: z.string(),
    Labels: z.string(),
    Mountpoint: z.string(),
    Scope: z.string(),
    CreatedAt: z.optional(z.string()),
    Size: z.optional(z.string()),
});

export type DockerVolumeRecord = z.infer<typeof DockerVolumeRecordSchema>;

/**
 * Normalize a parsed {@link DockerVolumeRecord} (from `volume ls`) to the common
 * {@link ListVolumeItem}. Unlike the inspect record, the `volume ls` shape emits
 * `Labels` as a comma-separated string, may include a `Size`, and leaves
 * `createdAt` undefined when `CreatedAt` is absent.
 */
export function normalizeDockerVolumeRecord(rawVolume: DockerVolumeRecord): ListVolumeItem {
    return {
        name: rawVolume.Name,
        driver: rawVolume.Driver,
        // Parse the labels assigned to the volumes and normalize to key value pairs
        labels: parseDockerLikeLabels(rawVolume.Labels),
        mountpoint: rawVolume.Mountpoint,
        scope: rawVolume.Scope,
        createdAt: rawVolume.CreatedAt ? dayjs.utc(rawVolume.CreatedAt).toDate() : undefined,
        size: tryParseSize(rawVolume.Size),
    };
}
