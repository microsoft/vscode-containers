/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as z from 'zod/mini';
import type { ListImagesItem } from '../../contracts/ContainerClient';
import { dateStringWithFallbackSchema } from '../../contracts/ZodTransforms';
import { parseDockerLikeImageName } from '../../utils/parseDockerLikeImageName';
import { tryParseSize } from '../DockerClientBase/tryParseSize';

/**
 * Nerdctl (nerdctl) uses a format similar to Docker but with some differences.
 * nerdctl image ls --format '{{json .}}' outputs per-line JSON.
 * Date transformation is applied during parsing.
 */
export const NerdctlListImageRecordSchema = z.object({
    ID: z.optional(z.string()),
    Repository: z.string(),
    Tag: z.optional(z.string()),
    // Date string transformed to Date object with fallback to current time
    CreatedAt: z.optional(dateStringWithFallbackSchema),
    CreatedSince: z.optional(z.string()),
    Size: z.optional(z.union([z.string(), z.number()])),
    Digest: z.optional(z.string()),
    Platform: z.optional(z.string()),
});

export type NerdctlListImageRecord = z.infer<typeof NerdctlListImageRecordSchema>;

/**
 * Normalize a parsed NerdctlListImageRecord to the common ListImagesItem format.
 * Date transformation is already done by the schema.
 */
export function normalizeNerdctlListImageRecord(image: NerdctlListImageRecord): ListImagesItem {

    // Use the shared tryParseSize utility for consistent size parsing
    const size = tryParseSize(image.Size);

    // Handle optional/empty Tag - only append if it's a non-empty string
    const tag = image.Tag?.trim();
    const repositoryAndTag = `${image.Repository}${tag && tag !== '<none>' ? `:${tag}` : ''}`;

    return {
        id: image.ID || '',
        image: parseDockerLikeImageName(repositoryAndTag),
        createdAt: image.CreatedAt ?? new Date(),
        size,
    };
}
