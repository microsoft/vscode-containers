/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { registerMcpToolWithTelemetry } from '@microsoft/vscode-inproc-mcp/vscode';
import { actContainerTool } from './tools/containers/actContainer';
import { inspectContainerTool } from './tools/containers/inspectContainer';
import { listContainersTool } from './tools/containers/listContainers';
import { logsContainerTool } from './tools/containers/logsContainer';
import { runContainerTool } from './tools/containers/runContainer';
import { actImageTool } from './tools/images/actImage';
import { inspectImageTool } from './tools/images/inspectImage';
import { listImagesTool } from './tools/images/listImages';
import { tagImageTool } from './tools/images/tagImage';
import { listNetworksTool } from './tools/networks/listNetworks';
import { pruneTool } from './tools/system/prune';
import { listVolumesTool } from './tools/volumes/listVolumes';

export function registerContainersTools(mcpServer: never): void {
    // Container tools
    registerMcpToolWithTelemetry(mcpServer, actContainerTool);
    registerMcpToolWithTelemetry(mcpServer, inspectContainerTool);
    registerMcpToolWithTelemetry(mcpServer, listContainersTool);
    registerMcpToolWithTelemetry(mcpServer, logsContainerTool);
    registerMcpToolWithTelemetry(mcpServer, runContainerTool);

    // Image tools
    registerMcpToolWithTelemetry(mcpServer, actImageTool);
    registerMcpToolWithTelemetry(mcpServer, inspectImageTool);
    registerMcpToolWithTelemetry(mcpServer, listImagesTool);
    registerMcpToolWithTelemetry(mcpServer, tagImageTool);

    // Network tools
    registerMcpToolWithTelemetry(mcpServer, listNetworksTool);

    // System tools
    registerMcpToolWithTelemetry(mcpServer, pruneTool);

    // Volume tools
    registerMcpToolWithTelemetry(mcpServer, listVolumesTool);
}
