/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as z from 'zod/mini';
import type { ListImagesItem } from '../../contracts/ContainerClient';
import { dateStringWithFallbackSchema } from '../../contracts/ZodTransforms';
import { parseDockerLikeImageName } from '../../utils/parseDockerLikeImageName';

const AppleContainerImageVariantSchema = z.object({
    size: z.optional(z.number()),
    platform: z.optional(z.object({
        architecture: z.optional(z.string()),
    })),
});

/**
 * `container image list --format json` emits a manifest-list-oriented shape (captured
 * against real CLI 1.2.0 output), not Docker's flat `Repository`/`Tag`/`ID`/`Size`: the
 * repository/tag live in `configuration.name` (a sibling of `configuration.descriptor`, e.g.
 * `"docker.io/library/alpine:latest"`), and per-platform blobs live under `variants[]`.
 * `image pull` defaults to fetching every platform in a multi-arch manifest -- `variants`
 * reflects what's actually present locally (confirmed: an image pulled with `--arch arm64`
 * has exactly one variant), so summing `variants[].size` gives the real on-disk size rather
 * than double-counting undownloaded platforms. Each real platform variant is paired with a
 * same-sized-ish `platform.architecture: "unknown"` attestation/provenance blob (~86KB,
 * confirmed present for every real platform in a multi-arch pull); those are excluded from
 * the size sum since they aren't part of the image itself.
 */
export const AppleContainerListImageRecordSchema = z.object({
    id: z.string(),
    configuration: z.object({
        creationDate: z.optional(dateStringWithFallbackSchema),
        name: z.optional(z.string()),
    }),
    variants: z.optional(z.array(AppleContainerImageVariantSchema)),
});

export type AppleContainerListImageRecord = z.infer<typeof AppleContainerListImageRecordSchema>;

/**
 * Normalize a parsed {@link AppleContainerListImageRecord} to the common
 * {@link ListImagesItem}.
 */
export function normalizeAppleContainerListImageRecord(image: AppleContainerListImageRecord): ListImagesItem {
    const size = (image.variants ?? [])
        .filter((variant) => variant.platform?.architecture !== 'unknown')
        .reduce((total, variant) => total + (variant.size ?? 0), 0);

    return {
        id: image.id,
        image: parseDockerLikeImageName(image.configuration.name),
        createdAt: image.configuration.creationDate ?? new Date(0),
        size: size > 0 ? size : undefined,
    };
}
