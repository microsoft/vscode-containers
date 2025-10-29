/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { z } from 'zod';
import type { ToolExecutionExtras, ToolIOSchema } from '../contracts/CopilotTool';
import { McpTool } from '../mcp/McpTool';
import type { McpToolResult } from '../mcp/McpToolResult';
import { Lazy } from '../utils/Lazy';

export class McpToolWithTelemetry<TInSchema extends ToolIOSchema, TOutSchema extends ToolIOSchema> extends McpTool<TInSchema, TOutSchema> {
    public override async executeMcp(input: z.infer<TInSchema>, extra: ToolExecutionExtras): Promise<McpToolResult> {
        const callWithTelemetryAndErrorHandling = await callWithTelemetryAndErrorHandlingLazy.value;

        return await callWithTelemetryAndErrorHandling<McpToolResult>(`mcpTool/${this.name}`, async (context) => {
            // Copilot will display the error messages, we don't need to also display them
            context.errorHandling.suppressDisplay = true;

            const result = await super.executeMcp(input, extra);

            if (!result) {
                // This should never ever happen
                throw new Error('No result from tool execution');
            } else if ('isError' in result && !!result.isError) {
                if (extra?.signal?.aborted) {
                    context.telemetry.properties.result = 'Canceled';
                } else {
                    context.telemetry.properties.result = 'Failed';
                }

                context.telemetry.properties.errorMessage = result.content?.[0]?.text;
            }

            return result;
        }) as McpToolResult; // Cast is OK since we know it will never be undefined
    }
}

const callWithTelemetryAndErrorHandlingLazy = new Lazy(async () => {
    const { callWithTelemetryAndErrorHandling } = await import('@microsoft/vscode-azext-utils');
    return callWithTelemetryAndErrorHandling;
});
