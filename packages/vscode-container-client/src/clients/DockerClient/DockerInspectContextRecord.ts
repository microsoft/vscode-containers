/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as z from 'zod/mini';

export const DockerInspectContextRecordSchema = z.object({
    Name: z.string(),
    Metadata: z.optional(z.object({
        Description: z.optional(z.string()),
    })),
});
