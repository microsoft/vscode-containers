/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { CopilotTool } from '@microsoft/vscode-inproc-mcp';
import { z } from 'zod';
import { ext } from '../../../extensionVariables';

const GetContainersConfigOutputSchema = z.object({
    cliCommand: z.string().describe('The command-line string used to invoke the container CLI tool'),
    orchestratorCommand: z.string().describe('The command-line string used to invoke the container orchestrator CLI tool'),
    env: z.record(z.string(), z.string()).describe('Environment variables to set when invoking the container CLI tool'),
});

export const getContainersConfigTool: CopilotTool<z.ZodVoid, typeof GetContainersConfigOutputSchema> = {
    name: 'get_containers_config',
    outputSchema: GetContainersConfigOutputSchema,
    description: 'Gets the configuration for the container CLI tool',
    annotations: {
        readOnlyHint: true,
    },
    execute: async (_input, extras) => {
        const containerClient = await ext.runtimeManager.getClient();
        const orchestratorClient = await ext.orchestratorManager.getClient();

        return {
            cliCommand: containerClient.commandName,
            orchestratorCommand: orchestratorClient.commandName,
            env: { /* TODO */ },
        };
    },
};
