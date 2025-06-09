/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { z } from 'zod/v4';

export const DockerVersionRecordSchema = z.object({
    Client: z.object({
        ApiVersion: z.string(),
    }),
    Server: z.object({
        ApiVersion: z.string(),
    }),
});
