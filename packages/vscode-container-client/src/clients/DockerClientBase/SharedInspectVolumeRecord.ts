/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as z from 'zod/mini';
import type { InspectVolumesItem } from '../../contracts/ContainerClient';
import { dateStringWithFallbackSchema, labelsSchema } from '../../contracts/ZodTransforms';

/**
 * A single, tolerant schema for the Docker-compatible volume `inspect` output
 * emitted by Docker, Podman, nerdctl, and wslc. Docker and Podman always emit
 * `Driver`, `Mountpoint`, and `Scope`; nerdctl may omit them, so they are
 * modeled as optional and backfilled by the normalizer.
 *
 * `Labels` reuses {@link labelsSchema} (record or `key=value` string) and
 * `CreatedAt` reuses {@link dateStringWithFallbackSchema} so the schema does the
 * normalization once for every runtime.
 */
export const SharedInspectVolumeRecordSchema = z.object({
    Name: z.string(),
    Driver: z.optional(z.string()),
    Mountpoint: z.optional(z.string()),
    Scope: z.optional(z.string()),
    // Labels can be a record, empty string, or "key=value,key2=value2" string
    Labels: z.optional(z.nullable(labelsSchema)),
    Options: z.optional(z.nullable(z.record(z.string(), z.unknown()))),
    // wslc spells the driver options `DriverOpts`
    DriverOpts: z.optional(z.nullable(z.record(z.string(), z.unknown()))),
    // Date string transformed to Date with fallback to current time
    CreatedAt: z.optional(dateStringWithFallbackSchema),
});

export type SharedInspectVolumeRecord = z.infer<typeof SharedInspectVolumeRecordSchema>;

/**
 * Small per-runtime knobs that capture the intentional differences between the
 * otherwise-identical Docker/Podman/nerdctl inspect volume normalizers.
 */
export interface NormalizeInspectVolumeOptions {
    /**
     * Fallback driver when the runtime omits `Driver` (nerdctl). Docker and
     * Podman always emit a driver, so they leave this unset.
     */
    defaultDriver?: string;
    /**
     * Fallback scope when the runtime omits `Scope` (nerdctl). Docker and Podman
     * always emit a scope, so they leave this unset.
     */
    defaultScope?: string;
}

/**
 * Normalize a parsed {@link SharedInspectVolumeRecord} to the common
 * {@link InspectVolumesItem}. Labels and the creation date are already
 * normalized by the schema transforms.
 */
export function normalizeInspectVolumeRecord(volume: SharedInspectVolumeRecord, raw: string, options: NormalizeInspectVolumeOptions = {}): InspectVolumesItem {
    // Return the normalized InspectVolumesItem record
    return {
        name: volume.Name,
        driver: volume.Driver || options.defaultDriver || '',
        mountpoint: volume.Mountpoint || '',
        scope: volume.Scope || options.defaultScope || '',
        labels: volume.Labels ?? {},
        options: volume.Options ?? volume.DriverOpts ?? {},
        createdAt: volume.CreatedAt ?? new Date(),
        raw,
    };
}
