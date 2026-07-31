/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as z from 'zod/mini';
import { sizeSchema, unixEpochSecondsSchema } from '../../contracts/ZodTransforms';
import type { SharedListImageRecord } from '../DockerClientBase/SharedListImageRecord';

/**
 * `wslc images --format json` reports the same information as Docker's
 * `image ls`, but under different keys (`Id` rather than `ID`, and `Created` as
 * a Unix epoch in seconds rather than a `CreatedAt` date string). Rather than
 * duplicating the normalizer, the record is mapped onto
 * {@link SharedListImageRecord} so `normalizeListImageRecord` can be reused
 * as-is.
 */
export const WslcListImageRecordSchema = z.pipe(
    z.object({
        Id: z.string(),
        Repository: z.nullish(z.string()),
        Tag: z.nullish(z.string()),
        // `sizeSchema` is nullish-fronted, so the key is already optional
        Size: sizeSchema,
        Created: unixEpochSecondsSchema,
    }),
    z.transform((image): SharedListImageRecord => ({
        ID: image.Id,
        Repository: image.Repository ?? undefined,
        Tag: image.Tag ?? undefined,
        CreatedAt: image.Created,
        Size: image.Size,
    })),
);
