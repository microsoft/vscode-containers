/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { PortBinding, RunContainerCommandOptions, RunContainerMount } from '@microsoft/vscode-container-client';
import type { CopilotTool } from '@microsoft/vscode-inproc-mcp';
import { z } from 'zod';
import { ext } from '../../../extensionVariables';
import { TaskCommandRunnerFactory } from '../../../runtimes/runners/TaskCommandRunnerFactory';

const PortBindingSchema = z.object({
    containerPort: z.number().describe('The port inside the container'),
    hostPort: z.number().optional().describe('The port on the host machine to bind to the container port'),
    protocol: z.enum(['tcp', 'udp']).optional().describe('The protocol to use for the port binding').default('tcp'),
});

const BindMountSchema = z.object({
    type: z.literal('bind').describe('Must be "bind" for bind mounts'),
    source: z.string().describe('The path on the host machine to bind mount'),
    destination: z.string().describe('The path inside the container to mount to'),
    readOnly: z.boolean().optional().describe('Whether the bind mount should be read-only').default(false),
});

const VolumeMountSchema = z.object({
    type: z.literal('volume').describe('Must be "volume" for volume mounts'),
    source: z.string().describe('The name of the volume to mount. If it does not exist, a new volume will be created'),
    destination: z.string().describe('The path inside the container to mount to'),
    readOnly: z.boolean().optional().describe('Whether the volume mount should be read-only').default(false),
});

const MountSchema = z.union([BindMountSchema, VolumeMountSchema]);

const LogsContainerInputSchema = z.object({
    image: z.string().describe('The image to start the container from'),
    name: z.string().optional().describe('Container name'),
    environmentVariables: z.record(z.string(), z.string()).optional().describe('Environment variables to set in the container'),
    publishAllPorts: z.boolean().optional().describe('Publish all exposed ports to random ports on the host interfaces. For containers that host a web service, this should usually be true.'),
    interactive: z.boolean().optional().describe('Whether to run the container in interactively.').default(false),
    ports: z.array(PortBindingSchema).optional().describe('Port bindings for the container. Can be used alongside publishAllPorts, but often isn\'t necessary if publishAllPorts is true.'),
    mounts: z.array(MountSchema).optional().describe('Bind and volume mounts for the container.'),
    network: z.string().optional().describe('The name of the container network to connect the container to.'),
});

export const runContainerTool: CopilotTool<typeof LogsContainerInputSchema, z.ZodVoid> = {
    name: 'run_container',
    inputSchema: LogsContainerInputSchema,
    description: 'Run a new container',
    annotations: {
        destructiveHint: true, // Running a container is not necessarily destructive, but it might be
        idempotentHint: false,
    },
    execute: async (input, extras) => {
        const runOptions: RunContainerCommandOptions = {
            imageRef: input.image,
            name: input.name,
            environmentVariables: input.environmentVariables,
            publishAllPorts: input.publishAllPorts,
            detached: !input.interactive, // Or the agent will have to wait forever
            interactive: !!input.interactive,
            ports: input.ports as PortBinding[] | undefined, // As cast to make TS happy
            mounts: input.mounts as RunContainerMount[] | undefined, // As cast to make TS happy
            network: input.network,
        };

        if (runOptions.interactive) {
            const client = await ext.runtimeManager.getClient();
            const taskCRF = new TaskCommandRunnerFactory(
                {
                    taskName: input.image,
                    alwaysRunNew: true,
                }
            );

            // Don't wait--the task will run interactively but we don't want to block the agent forever
            void taskCRF.getCommandRunner()(
                client.runContainer(runOptions)
                // Cancellation is intentionally ignored--cancelling the Copilot task shouldn't stop the container
            );
        } else {
            // Await--this will be detached anyway
            await ext.runWithDefaults(client =>
                client.runContainer(runOptions),
                { cancellationToken: extras.token }
            );
        }
    },
};

