/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as z from 'zod/mini';

export const WslcListImageRecordSchema = z.object({
    Id: z.string(),
    Repository: z.nullish(z.string()),
    Tag: z.nullish(z.string()),
    Size: z.optional(z.number()),
    // wslc emits Created as a Unix epoch in seconds.
    Created: z.number(),
});

export type WslcListImageRecord = z.infer<typeof WslcListImageRecordSchema>;
