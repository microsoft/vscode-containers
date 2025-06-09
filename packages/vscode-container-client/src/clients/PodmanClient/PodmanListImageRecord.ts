/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { z } from 'zod/v4';

export const PodmanListImageRecordSchema = z.object({
    Id: z.string(),
    Names: z.array(z.string()).optional(),
    Size: z.number(),
    Labels: z.record(z.string(), z.string()).optional().nullable(),
    Created: z.number(),
});

export type PodmanListImageRecord = z.infer<typeof PodmanListImageRecordSchema>;
