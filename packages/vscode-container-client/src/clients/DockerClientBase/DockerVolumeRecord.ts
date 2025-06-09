/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { z } from 'zod/v4';

export const DockerVolumeRecordSchema = z.object({
    Name: z.string(),
    Driver: z.string(),
    Labels: z.string(),
    Mountpoint: z.string(),
    Scope: z.string(),
    CreatedAt: z.string().optional(),
    Size: z.string().optional(),
});
