/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { callWithTelemetryAndErrorHandling } from '@microsoft/vscode-azext-utils';
import { McpTool, McpToolResult, ToolExecutionExtras, ToolIOSchema } from '@microsoft/vscode-inproc-mcp';
import type { z } from 'zod';

export class McpToolWithTelemetry<TInSchema extends ToolIOSchema, TOutSchema extends ToolIOSchema> extends McpTool<TInSchema, TOutSchema> {
    public override async executeMcp(input: z.infer<TInSchema>, extra: ToolExecutionExtras): Promise<McpToolResult> {
        return await callWithTelemetryAndErrorHandling<McpToolResult>(`mcpTool/${this.name}`, async (context) => {
            // Copilot will display the error messages, we don't need to also display them
            context.errorHandling.suppressDisplay = true;

            // TODO: cancellation token instead of abort signal? Easier to use in our lower libraries
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
        });
    }
}
