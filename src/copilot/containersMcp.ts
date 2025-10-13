/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { registerMcpToolWithTelemetry } from '@microsoft/vscode-inproc-mcp/vscode';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { extensionVersion, McpServerId, McpServerLabel } from '../constants';
import { getMcpServer } from '../utils/lazyPackages';
import { actContainerTool } from './tools/containers/actContainer';
import { inspectContainerTool } from './tools/containers/inspectContainer';
import { listContainersTool } from './tools/containers/listContainers';
import { logsContainerTool } from './tools/containers/logsContainer';
import { runContainerTool } from './tools/containers/runContainer';
import { actImageTool } from './tools/images/actImage';
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

    registerMcpToolWithTelemetry(mcpServer, actContainerTool);
    registerMcpToolWithTelemetry(mcpServer, inspectContainerTool);
    registerMcpToolWithTelemetry(mcpServer, listContainersTool);
    registerMcpToolWithTelemetry(mcpServer, logsContainerTool);
    registerMcpToolWithTelemetry(mcpServer, runContainerTool);

    registerMcpToolWithTelemetry(mcpServer, actImageTool);
    registerMcpToolWithTelemetry(mcpServer, inspectImageTool);
    registerMcpToolWithTelemetry(mcpServer, listImagesTool);

    registerMcpToolWithTelemetry(mcpServer, listNetworksTool);

    registerMcpToolWithTelemetry(mcpServer, listVolumesTool);

    return mcpServer;
}
