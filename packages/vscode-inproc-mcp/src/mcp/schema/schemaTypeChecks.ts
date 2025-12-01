/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { z } from 'zod/v4';
import type { ToolIOSchema } from '../../contracts/CopilotTool';

export function isVoidishSchema(schema: ToolIOSchema | undefined): schema is undefined | z.ZodVoid {
    return schema === undefined || schema instanceof z.ZodVoid;
}

export function isEmptyObjectSchema(schema: ToolIOSchema): boolean {
    return schema instanceof z.ZodObject && Object.keys(schema.shape).length === 0;
}
