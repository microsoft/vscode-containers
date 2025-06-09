/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { z } from 'zod/v4';
import { EventActionSchema, EventTypeSchema } from '../../contracts/ZodEnums';

export const PodmanEventRecordSchema = z.object({
    ID: z.string().optional(), // Not in v3
    Type: EventTypeSchema,
    Status: EventActionSchema,
    Name: z.string(),
    Time: z.string().optional(), // Not in v5
    time: z.number().optional(), // Not in v3, v4
    Attributes: z.record(z.string(), z.unknown()).optional(),
});
