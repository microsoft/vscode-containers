/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as z from 'zod/mini';

export const DockerContextRecordSchema = z.object({
    Name: z.string(),
    Current: z.boolean(),
    Description: z.optional(z.string()),
    DockerEndpoint: z.optional(z.string()),
});
