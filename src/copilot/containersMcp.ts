/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { registerMcpTool } from '@microsoft/vscode-inproc-mcp';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { extensionVersion, McpServerId, McpServerLabel } from '../constants';
import { actContainerTool } from './tools/actContainer';
import { inspectContainerTool } from './tools/inspectContainer';
import { listContainersTool } from './tools/listContainers';

export function getContainersMcpServer(): McpServer {
    const mcpServer = new McpServer(
        {
            name: McpServerId,
            title: McpServerLabel,
            version: extensionVersion.value,
        }
    );

    registerMcpTool(mcpServer, actContainerTool);
    registerMcpTool(mcpServer, listContainersTool);
    registerMcpTool(mcpServer, inspectContainerTool);

    return mcpServer;
}
