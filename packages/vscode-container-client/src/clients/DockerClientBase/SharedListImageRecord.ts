/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as z from 'zod/mini';
import type { ListImagesItem } from '../../contracts/ContainerClient';
import { dateStringWithFallbackSchema, sizeSchema } from '../../contracts/ZodTransforms';
import { parseDockerLikeImageName } from '../../utils/parseDockerLikeImageName';

/**
 * A single, tolerant schema for the Docker-compatible `image ls` per-line JSON
 * emitted by Docker and nerdctl. Docker emits `ID`/`Size` unconditionally;
 * nerdctl may omit them. The size and creation date are normalized by the shared
 * field transforms.
 *
 * Podman's `image ls` output is object-shaped (`Names` array, numeric `Created`)
 * and keeps its own record module rather than sharing this schema.
 */
export const SharedListImageRecordSchema = z.object({
    ID: z.optional(z.string()),
    Repository: z.string(),
    Tag: z.optional(z.string()),
    // Date string transformed to Date with fallback to current time
    CreatedAt: z.optional(dateStringWithFallbackSchema),
    // Size (bytes number or human-readable string) transformed to number | undefined
    Size: z.optional(sizeSchema),
});

export type SharedListImageRecord = z.infer<typeof SharedListImageRecordSchema>;

/**
 * Small per-runtime knobs that capture the intentional differences between the
 * Docker and nerdctl list-image normalizers.
 */
export interface NormalizeListImageOptions {
    /**
     * Treat a `<none>` tag as no tag at all rather than appending it to the
     * repository name. Docker historically keeps the `<none>` sentinel in the
     * composed name (and therefore in `originalName`); nerdctl drops it.
     */
    dropNoneTag?: boolean;
}

/**
 * The list-image normalizer settings used by Docker (and Docker-compatible
 * runtimes that do not override them).
 */
export const DockerListImageOptions: NormalizeListImageOptions = {};

/**
 * The list-image normalizer settings used by nerdctl.
 */
export const NerdctlListImageOptions: NormalizeListImageOptions = {
    dropNoneTag: true,
};

/**
 * Normalize a parsed {@link SharedListImageRecord} to the common
 * {@link ListImagesItem}. The size and creation date are already normalized by
 * the schema transforms.
 */
export function normalizeListImageRecord(image: SharedListImageRecord, options: NormalizeListImageOptions = DockerListImageOptions): ListImagesItem {
    const tag = image.Tag?.trim();
    const includeTag = !!tag && !(options.dropNoneTag && tag === '<none>');
    const repositoryAndTag = `${image.Repository}${includeTag ? `:${tag}` : ''}`;

    return {
        id: image.ID || '',
        image: parseDockerLikeImageName(repositoryAndTag),
        // labels: {}, // TODO: image labels are conspicuously absent from Docker image listing output
        createdAt: image.CreatedAt ?? new Date(),
        size: image.Size,
    };
}
