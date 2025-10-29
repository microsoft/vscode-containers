/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type * as vscode from 'vscode';

/**
 * Options for registering an in-proc MCP HTTP provider
 */
export interface McpProviderOptions {
    /**
     * The ID for this MCP provider. Must match what is in package.json's contributions.mcpServerDefinitionProviders section
     */
    readonly id: string;

    /**
     * A human-readable label for the server
     */
    readonly serverLabel: string;

    /**
     * The version of the MCP server. VSCode does use this as a hint on whether it should refresh the tool list
     */
    readonly serverVersion: string;

    /**
     * Called to register tools on the MCP server after it is created
     * @param server The server to register tools on
     */
    registerTools: (server: McpServer) => void | Promise<void>;

    /**
     * Optional event that fires when the set of available MCP server definitions changes
     */
    onDidChange?: vscode.Event<void>;
}
