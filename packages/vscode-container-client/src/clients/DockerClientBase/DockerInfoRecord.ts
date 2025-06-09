/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { z } from 'zod/v4';
import { ContainerOSSchema } from '../../contracts/ZodEnums';

export const DockerInfoRecordSchema = z.object({
    OperatingSystem: z.string().optional(),
    OSType: ContainerOSSchema.optional(),
});
