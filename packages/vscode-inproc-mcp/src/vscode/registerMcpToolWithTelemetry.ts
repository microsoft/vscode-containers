/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CopilotTool, ToolIOSchema } from '../contracts/CopilotTool';
import { registerMcpTool } from '../mcp/registerMcpTool';
import { McpToolWithTelemetry } from './McpToolWithTelemetry';

/**
 * Registers a tool with the MCP server, wrapping it in telemetry
 * @param server The MCP server to register the tool with
 * @param tool The tool to register
 * @returns The registered tool
 */
export function registerMcpToolWithTelemetry<TInSchema extends ToolIOSchema, TOutSchema extends ToolIOSchema>(
    mcpServer: McpServer,
    tool: CopilotTool<TInSchema, TOutSchema>
) {
    registerMcpTool(mcpServer, tool, McpToolWithTelemetry);
}
