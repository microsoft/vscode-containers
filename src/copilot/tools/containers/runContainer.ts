/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { CopilotTool } from '@microsoft/vscode-inproc-mcp';
import { z } from 'zod';
import { ext } from '../../../extensionVariables';

const LogsContainerInputSchema = z.object({
    image: z.string().describe('The image to start the container from'),
    name: z.string().optional().describe('Container name'),
    environmentVariables: z.record(z.string(), z.string()).optional().describe('Environment variables to set in the container'),
    publishAllPorts: z.boolean().optional().describe('Publish all exposed ports to random ports on the host interfaces. For containers that host a web service, this should usually be true.'),
    // TODO: ports? Potentially too complicated for the model to understand?
    // TODO: volumes/bind mounts? Possible security risk to other containers or the host machine
    // TODO: networks? Possible security risk to other containers or the host machine
    // TODO: interactive/detached? User experience
});

export const runContainerTool: CopilotTool<typeof LogsContainerInputSchema, z.ZodVoid> = {
    name: 'run_container',
    inputSchema: LogsContainerInputSchema,
    description: 'Run a new container',
    annotations: {
        destructiveHint: true, // Running a container is not necessarily destructive, but it might be
        idempotentHint: false,
    },
    execute: async (input) => {
        await ext.runWithDefaults(client =>
            client.runContainer({
                imageRef: input.image,
                name: input.name,
                environmentVariables: input.environmentVariables,
                publishAllPorts: input.publishAllPorts,
                detached: true, // Or the agent will have to wait forever
            })
        );
    },
};

