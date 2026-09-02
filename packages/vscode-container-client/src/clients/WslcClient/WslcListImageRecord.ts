/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as z from 'zod/mini';
import { dateStringWithFallbackSchema, sizeSchema, unixEpochSecondsSchema } from '../../contracts/ZodTransforms';
import type { SharedListImageRecord } from '../DockerClientBase/SharedListImageRecord';

/**
 * wslc reports missing repository/tag data with Docker's `<none>` sentinel rather than omitting
 * the key. Treating it as absent keeps unnamed images unnamed instead of naming them
 * `<none>:<none>`, matching how older wslc releases (which omitted the keys) behave.
 */
const noneSentinel = '<none>';

function withoutNoneSentinel(value: string | null | undefined): string | undefined {
    return !value || value === noneSentinel ? undefined : value;
}

/**
 * The `wslc images --format json` shape emitted by wslc 2.9.8 and later: Docker's
 * `image ls --format json` record, in which every value is a string. `--no-trunc` is passed by
 * `WslcClient.getListImagesCommandArgs` so `ID` keeps its full `sha256:`-prefixed form.
 */
const WslcCurrentListImageRecordSchema = z.pipe(
    z.object({
        ID: z.string(),
        Repository: z.nullish(z.string()),
        Tag: z.nullish(z.string()),
        // Human-readable size string (e.g. `8.416MB`) or `N/A`, normalized by the shared transform
        Size: sizeSchema,
        // Docker-style date string (e.g. `2026-06-12 09:21:29 -0400 EDT`)
        CreatedAt: dateStringWithFallbackSchema,
    }),
    z.transform((image): SharedListImageRecord => ({
        ID: image.ID,
        Repository: withoutNoneSentinel(image.Repository),
        Tag: withoutNoneSentinel(image.Tag),
        CreatedAt: image.CreatedAt,
        Size: image.Size,
    })),
);

/**
 * The `wslc images --format json` shape emitted by wslc 2.9.4 and earlier: the service's native
 * record, with `Id` rather than `ID`, a byte-count `Size`, and `Created` as a Unix epoch in
 * seconds rather than a `CreatedAt` date string.
 */
const WslcLegacyListImageRecordSchema = z.pipe(
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
        Repository: withoutNoneSentinel(image.Repository),
        Tag: withoutNoneSentinel(image.Tag),
        CreatedAt: image.Created,
        Size: image.Size,
    })),
);

/**
 * `wslc images --format json` reports the same information as Docker's `image ls`, but the key
 * names and value types changed in wslc 2.9.8: the service's native record (`Id`, byte-count
 * `Size`, epoch-seconds `Created`) became Docker's all-string `image ls --format json` record
 * (`ID`, human-readable `Size`, `CreatedAt` date string). Both shapes are accepted so the
 * extension works against either wslc generation, and both are mapped onto
 * {@link SharedListImageRecord} so `normalizeListImageRecord` can be reused as-is.
 *
 * The two shapes are disjoint (`ID`/`CreatedAt` vs. `Id`/`Created`), so a record belonging to
 * neither generation is still rejected rather than silently parsed as an empty image.
 */
export const WslcListImageRecordSchema = z.union([
    WslcCurrentListImageRecordSchema,
    WslcLegacyListImageRecordSchema,
]);
