/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as z from 'zod/mini';
import type { ListVolumeItem } from '../../contracts/ContainerClient';
import { dateStringSchema, labelsSchema, sizeSchema } from '../../contracts/ZodTransforms';

/**
 * A single, tolerant schema for the Docker-compatible volume `ls` output emitted
 * by Docker, Podman, and nerdctl. Docker emits newline-delimited objects with a
 * comma-separated `Labels` string and a `Size`; Podman emits a JSON array of the
 * inspect shape (record `Labels`, no `Size`); nerdctl may omit `Driver`/`Scope`.
 *
 * Every field except `Name` is therefore optional and the shared Zod transforms
 * absorb the shape differences: {@link labelsSchema} accepts either a
 * `key=value` string or an already-parsed record, {@link dateStringSchema}
 * yields `undefined` when `CreatedAt` is absent or invalid (no fabricated date),
 * and {@link sizeSchema} yields `undefined` when there is no size.
 */
export const SharedListVolumeRecordSchema = z.object({
    Name: z.string(),
    Driver: z.optional(z.string()),
    Mountpoint: z.optional(z.string()),
    Scope: z.optional(z.string()),
    // Labels can be a record, empty string, or "key=value,key2=value2" string
    Labels: z.optional(z.nullable(labelsSchema)),
    // Date string transformed to Date; undefined when absent/invalid
    CreatedAt: z.optional(dateStringSchema),
    // Byte count or human-readable size string transformed to a number
    // `sizeSchema` is nullish-fronted, so the key is already optional.
    Size: sizeSchema,
});

export type SharedListVolumeRecord = z.infer<typeof SharedListVolumeRecordSchema>;

/**
 * Normalize a parsed {@link SharedListVolumeRecord} to the common
 * {@link ListVolumeItem}. `Driver` and `Scope` fall back to `'local'` for
 * runtimes (nerdctl) that omit them; Docker and Podman always emit real values,
 * so the fallback is inert for them.
 */
export function normalizeListVolumeRecord(volume: SharedListVolumeRecord): ListVolumeItem {
    return {
        name: volume.Name,
        driver: volume.Driver || 'local',
        labels: volume.Labels ?? {},
        mountpoint: volume.Mountpoint || '',
        scope: volume.Scope || 'local',
        createdAt: volume.CreatedAt,
        size: volume.Size,
    };
}
