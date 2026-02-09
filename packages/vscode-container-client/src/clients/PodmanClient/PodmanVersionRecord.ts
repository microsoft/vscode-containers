/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as z from 'zod/mini';

export const PodmanVersionRecordSchema = z.object({
    Client: z.object({
        APIVersion: z.string(),
    }),
    Server: z.optional(z.object({
        APIVersion: z.string(),
    })),
});
