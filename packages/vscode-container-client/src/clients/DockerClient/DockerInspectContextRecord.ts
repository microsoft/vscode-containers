/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { z } from 'zod/v4';

export const DockerInspectContextRecordSchema = z.object({
    Name: z.string(),
    Metadata: z.object({
        Description: z.string().optional(),
    }).optional(),
});
