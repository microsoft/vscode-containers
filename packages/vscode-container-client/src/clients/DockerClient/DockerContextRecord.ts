/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { z } from 'zod/v4';

export const DockerContextRecordSchema = z.object({
    Name: z.string(),
    Current: z.boolean(),
    Description: z.string().optional(),
    DockerEndpoint: z.string().optional(),
});
