/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { McpServer, RegisteredTool, ServerContext, StandardSchemaWithJSON } from '@modelcontextprotocol/server';
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

    const mcpInputSchema = toMcpServerSchema(normalizedInputSchema);
    const mcpOutputSchema = toMcpServerSchema(normalizedOutputSchema);

    if (mcpInputSchema === undefined) {
        return server.registerTool(
            mcpTool.name,
            {
                title: mcpTool.title,
                description: mcpTool.description,
                outputSchema: mcpOutputSchema,
                annotations: mcpTool.annotations,
            },
            async (extra: ServerContext) => {
                return mcpTool.executeMcp.call(mcpTool, undefined as z.infer<TInSchema>, toToolExecutionExtras(extra));
            }
        );
    }

    return server.registerTool(
        mcpTool.name,
        {
            title: mcpTool.title,
            description: mcpTool.description,
            inputSchema: mcpInputSchema,
            outputSchema: mcpOutputSchema,
            annotations: mcpTool.annotations,
        },
        async (input: unknown, extra: ServerContext) => {
            return mcpTool.executeMcp.call(mcpTool, input as z.infer<TInSchema>, toToolExecutionExtras(extra));
        }
    );
}

function toMcpServerSchema(schema: ToolIOSchema | undefined): StandardSchemaWithJSON<unknown, unknown> | undefined {
    if (!schema) {
        return undefined;
    }

    // zod/mini schemas implement the Standard Schema contract expected by @modelcontextprotocol/server,
    // but the TypeScript package types don't currently line up.
    return schema as unknown as StandardSchemaWithJSON<unknown, unknown>;
}

function toToolExecutionExtras(context: ServerContext) {
    return {
        signal: context.mcpReq.signal,
        requestId: context.mcpReq.id,
        sessionId: context.sessionId,
    };
}
