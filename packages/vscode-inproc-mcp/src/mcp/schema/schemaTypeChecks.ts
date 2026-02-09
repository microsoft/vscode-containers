/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as z from 'zod/mini';
import type { ToolIOSchema } from '../../contracts/CopilotTool';

export function isVoidishSchema(schema: ToolIOSchema | undefined): schema is undefined | z.ZodMiniVoid {
    return schema === undefined || schema instanceof z.ZodMiniVoid;
}

export function isEmptyObjectSchema(schema: ToolIOSchema): boolean {
    return schema instanceof z.ZodMiniObject && Object.keys(schema.shape).length === 0;
}
