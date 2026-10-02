/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as z from 'zod/mini';
import type { InspectVolumesItem, ListVolumeItem } from '../../contracts/ContainerClient';
import { dateStringWithFallbackSchema } from '../../contracts/ZodTransforms';

/**
 * `container volume list --format json` and `container volume inspect <names>` emit the
 * identical nested shape (captured against real CLI 1.2.0 output): `{configuration: {name,
 * driver, format, labels, options, sizeInBytes, source, creationDate}, id}`. There is no flat
 * `Name`/`Driver`/`Mountpoint` record to reuse from `SharedListVolumeRecordSchema`/
 * `SharedInspectVolumeRecordSchema`, so this keeps its own module and is shared by both
 * commands, same as the container/image records.
 */
export const AppleContainerListVolumeRecordSchema = z.object({
    id: z.string(),
    configuration: z.object({
        name: z.optional(z.string()),
        driver: z.optional(z.string()),
        // `source` is the host-side path to the volume's backing file -- the closest
        // equivalent to Docker's `Mountpoint`, even though it's a file (a raw disk image), not
        // a directory.
        source: z.optional(z.string()),
        labels: z.optional(z.record(z.string(), z.string())),
        options: z.optional(z.record(z.string(), z.unknown())),
        sizeInBytes: z.optional(z.number()),
        creationDate: z.optional(dateStringWithFallbackSchema),
    }),
});

export type AppleContainerListVolumeRecord = z.infer<typeof AppleContainerListVolumeRecordSchema>;

/**
 * Normalize a parsed {@link AppleContainerListVolumeRecord} to the common {@link ListVolumeItem}.
 */
export function normalizeAppleContainerListVolumeRecord(volume: AppleContainerListVolumeRecord): ListVolumeItem {
    return {
        name: volume.configuration.name ?? volume.id,
        driver: volume.configuration.driver ?? 'local',
        labels: volume.configuration.labels ?? {},
        mountpoint: volume.configuration.source ?? '',
        // Apple volumes are always local -- there is no volume-sharing/plugin-driven remote
        // scope concept for this runtime.
        scope: 'local',
        createdAt: volume.configuration.creationDate,
        size: volume.configuration.sizeInBytes,
    };
}

/**
 * Normalize a parsed {@link AppleContainerListVolumeRecord} to the common
 * {@link InspectVolumesItem}.
 */
export function normalizeAppleContainerInspectVolumeRecord(volume: AppleContainerListVolumeRecord, raw: string): InspectVolumesItem {
    return {
        name: volume.configuration.name ?? volume.id,
        driver: volume.configuration.driver ?? 'local',
        mountpoint: volume.configuration.source ?? '',
        scope: 'local',
        labels: volume.configuration.labels ?? {},
        options: volume.configuration.options ?? {},
        createdAt: volume.configuration.creationDate ?? new Date(0),
        raw,
    };
}
