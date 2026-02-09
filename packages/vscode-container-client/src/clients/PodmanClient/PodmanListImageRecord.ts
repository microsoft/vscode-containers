/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as z from 'zod/mini';

export const PodmanListImageRecordSchema = z.object({
    Id: z.string(),
    Names: z.optional(z.array(z.string())),
    Size: z.number(),
    Labels: z.nullish(z.record(z.string(), z.string())),
    Created: z.number(),
});

export type PodmanListImageRecord = z.infer<typeof PodmanListImageRecordSchema>;
