/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as z from 'zod/mini';
import { EventActionSchema, EventTypeSchema } from '../../contracts/ZodEnums';

export const PodmanEventRecordSchema = z.object({
    ID: z.optional(z.string()), // Not in v3
    Type: EventTypeSchema,
    Status: EventActionSchema,
    Name: z.string(),
    Time: z.optional(z.string()), // Not in v5
    time: z.optional(z.number()), // Not in v3, v4
    Attributes: z.optional(z.record(z.string(), z.unknown())),
});
