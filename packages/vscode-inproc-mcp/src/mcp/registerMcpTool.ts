/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { McpServer, RegisteredTool } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { RequestHandlerExtra } from '@modelcontextprotocol/sdk/shared/protocol.js';
import type { z } from 'zod/mini';
import type { CopilotTool, ToolIOSchema } from '../contracts/CopilotTool';
import { McpTool } from './McpTool';
import { isEmptyObjectSchema, isVoidishSchema } from './schema/schemaTypeChecks';

/**
 * Registers a tool with the MCP server
 * @param server The MCP server to register the tool with
 * @param tool The tool to register
 * @param mcpToolClass Advanced usage: the class to use for the MCP tool.
 * Defaults to {@link McpTool}.
 * @returns The registered tool
 */
export function registerMcpTool<TInSchema extends ToolIOSchema, TOutSchema extends ToolIOSchema>(
    server: McpServer,
    tool: CopilotTool<TInSchema, TOutSchema>,
    mcpToolClass = McpTool
): RegisteredTool {
    const mcpTool = new mcpToolClass(
        tool.name,
        tool.execute.bind(tool),
        {
            title: tool.title,
            description: tool.description,
            inputSchema: tool.inputSchema,
            outputSchema: tool.outputSchema,
            annotations: tool.annotations,
        }
    );

    let normalizedInputSchema: ToolIOSchema | undefined;
    if (isVoidishSchema(mcpTool.inputSchema)) {
        // Input can be void, but we'll treat that as having an undefined schema for the MCP SDK
        normalizedInputSchema = undefined;
    } else if (isEmptyObjectSchema(mcpTool.inputSchema)) {
        // Input cannot be an empty object or the LLM will not know what to do with it, so error out if that was passed in
        throw new Error('MCP tools cannot have an empty object input schema. Use ZodMiniVoid for no input, or define a non-empty object schema.');
    } else {
        normalizedInputSchema = mcpTool.inputSchema;
    }

    let normalizedOutputSchema: ToolIOSchema | undefined;
    if (isVoidishSchema(mcpTool.outputSchema) || isEmptyObjectSchema(mcpTool.outputSchema)) {
        // Output can be void or an empty object, but we'll treat that as having an undefined schema for the MCP SDK
        normalizedOutputSchema = undefined;
    } else {
        normalizedOutputSchema = mcpTool.outputSchema;
    }

    return server.registerTool(
        mcpTool.name,
        {
            ...mcpTool,
            inputSchema: normalizedInputSchema,
            outputSchema: normalizedOutputSchema,
        },
        async (input: unknown, extra: RequestHandlerExtra<never, never>) => {
            // If the input is void, MCP SDK will call with (extra) instead of (undefined, extra)
            // We won't want that, so detect that case and call appropriately
            if (inputIsRequestHandlerExtra(input)) {
                return mcpTool.executeMcp.call(mcpTool, undefined as z.infer<TInSchema>, input);
            } else {
                return mcpTool.executeMcp.call(mcpTool, input as z.infer<TInSchema>, extra);
            }
        }
    );
}

function inputIsRequestHandlerExtra(input: unknown): input is RequestHandlerExtra<never, never> {
    return !!input &&
        typeof input === 'object' &&
        'signal' in input &&
        input.signal instanceof AbortSignal;
}
