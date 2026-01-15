/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { CopilotTool } from '@microsoft/vscode-inproc-mcp';
import * as vscode from 'vscode';
import { z } from 'zod';
import { configPrefix } from '../../../constants';
import { ext } from '../../../extensionVariables';
import { isComposeV2ableOrchestratorClient } from '../../../runtimes/clients/AutoConfigurableDockerComposeClient';

const GetContainersConfigOutputSchema = z.object({
    cliCommand: z.string().describe('The command-line string used to invoke the container CLI tool, for example, "docker".'),
    orchestratorCommand: z.string().describe('The command-line string used to invoke the container orchestrator CLI tool, for example, "docker compose".'),
    env: z.record(z.string(), z.string()).describe('Environment variables to set before invoking the container CLI tool'),
});

export const getContainersConfigTool: CopilotTool<z.ZodVoid, typeof GetContainersConfigOutputSchema> = {
    name: 'get_containers_config',
    outputSchema: GetContainersConfigOutputSchema,
    description: 'Gets the configuration for the container CLI tool. Agents should use this information when invoking container CLI commands.',
    annotations: {
        readOnlyHint: true,
    },
    execute: async (_input, extras) => {
        const containerClient = await ext.runtimeManager.getClient();
        const orchestratorClient = await ext.orchestratorManager.getClient();
        const envConfig = vscode.workspace.getConfiguration(configPrefix).get<Record<string, string>>('environment', {});

        let orchestratorCommand = orchestratorClient.commandName;
        if (isComposeV2ableOrchestratorClient(orchestratorClient) && orchestratorClient.composeV2) {
            orchestratorCommand = `${orchestratorClient.commandName} compose`;
        }

        return {
            cliCommand: containerClient.commandName,
            orchestratorCommand: orchestratorCommand,
            env: envConfig,
        };
    },
};
