/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as z from 'zod/mini';

export const DockerVolumeRecordSchema = z.object({
    Name: z.string(),
    Driver: z.string(),
    Labels: z.string(),
    Mountpoint: z.string(),
    Scope: z.string(),
    CreatedAt: z.optional(z.string()),
    Size: z.optional(z.string()),
});
