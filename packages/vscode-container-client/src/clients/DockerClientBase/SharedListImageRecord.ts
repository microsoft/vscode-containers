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
    Size: sizeSchema,
});

export type SharedListImageRecord = z.infer<typeof SharedListImageRecordSchema>;

/**
 * Normalize a parsed {@link SharedListImageRecord} to the common
 * {@link ListImagesItem}. The size and creation date are already normalized by
 * the schema transforms.
 */
export function normalizeListImageRecord(image: SharedListImageRecord): ListImagesItem {
    // Handle optional/empty Tag - only append if it's a non-empty, non-"<none>" string
    const tag = image.Tag?.trim();
    const repositoryAndTag = `${image.Repository}${tag && tag !== '<none>' ? `:${tag}` : ''}`;

    return {
        id: image.ID || '',
        image: parseDockerLikeImageName(repositoryAndTag),
        // labels: {}, // TODO: image labels are conspicuously absent from Docker image listing output
        createdAt: image.CreatedAt ?? new Date(),
        size: image.Size,
    };
}
