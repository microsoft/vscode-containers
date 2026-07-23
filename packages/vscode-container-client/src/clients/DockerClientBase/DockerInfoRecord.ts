/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as z from 'zod/mini';
import { ContainerOSSchema } from '../../contracts/ZodEnums';

export const DockerInfoRecordSchema = z.object({
    OperatingSystem: z.optional(z.string()),
    OSType: z.optional(ContainerOSSchema),
});
