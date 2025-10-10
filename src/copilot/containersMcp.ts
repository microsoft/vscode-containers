/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CopilotTool, registerMcpTool as registerMcpToolInternal, ToolIOSchema } from '@microsoft/vscode-inproc-mcp';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { extensionVersion, McpServerId, McpServerLabel } from '../constants';
import { getMcpServer } from '../utils/lazyPackages';
import { McpToolWithTelemetry } from './McpToolWithTelemetry';

import { actContainerTool } from './tools/containers/actContainer';
import { inspectContainerTool } from './tools/containers/inspectContainer';
import { listContainersTool } from './tools/containers/listContainers';
import { logsContainerTool } from './tools/containers/logsContainer';

import { inspectImageTool } from './tools/images/inspectImage';
import { listImagesTool } from './tools/images/listImages';

import { listNetworksTool } from './tools/networks/listNetworks';

import { listVolumesTool } from './tools/volumes/listVolumes';

export async function getContainersMcpServer(): Promise<McpServer> {
    const { McpServer } = await getMcpServer();
    const mcpServer = new McpServer(
        {
            name: McpServerId,
            title: McpServerLabel,
            version: extensionVersion.value,
        }
    );

    registerMcpTool(mcpServer, actContainerTool);
    registerMcpTool(mcpServer, inspectContainerTool);
    registerMcpTool(mcpServer, listContainersTool);
    registerMcpTool(mcpServer, logsContainerTool);

    registerMcpTool(mcpServer, inspectImageTool);
    registerMcpTool(mcpServer, listImagesTool);

    registerMcpTool(mcpServer, listNetworksTool);

    registerMcpTool(mcpServer, listVolumesTool);

    return mcpServer;
}

function registerMcpTool<TInSchema extends ToolIOSchema, TOutSchema extends ToolIOSchema>(mcpServer: McpServer, tool: CopilotTool<TInSchema, TOutSchema>) {
    registerMcpToolInternal(mcpServer, tool, McpToolWithTelemetry);
}
