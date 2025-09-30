/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { CopilotTool } from '@microsoft/vscode-inproc-mcp';
import { z } from 'zod';
import { ext } from '../../extensionVariables';
import { ImageInfoSchema, PortBindingSchema } from './common';

const InspectContainersInputSchema = z.object({
    containerNameOrId: z.string(),
});

// TODO: more fully develop this schema
const InspectContainersOutputSchema = z.object({
    containers: z.array(
        z.object({
            id: z.string(),
            name: z.string(),
            imageId: z.string(),
            image: ImageInfoSchema,
            status: z.string().nullish(),
            environmentVariables: z.record(z.string()).nullish(),
            networks: z.array(z.unknown()).nullish(), // TODO
            ipAddress: z.string().nullish(),
            ports: z.array(PortBindingSchema).nullish(),
            mounts: z.array(z.unknown()).nullish(), // TODO
            labels: z.record(z.string()).nullish(),
            entrypoint: z.array(z.string()).nullish(),
            command: z.array(z.string()).nullish(),
            currentDirectory: z.string().nullish(),
            createdAt: z.string(),
        }).passthrough()
    ),
});

export const inspectContainerTool: CopilotTool<typeof InspectContainersInputSchema, typeof InspectContainersOutputSchema> = {
    name: 'inspect_container',
    inputSchema: InspectContainersInputSchema,
    outputSchema: InspectContainersOutputSchema,
    description: 'Inspect a container by name or ID',
    annotations: {
        readOnlyHint: true,
    },
    execute: async (input) => {
        const containers = await ext.runWithDefaults(client =>
            client.inspectContainers({ containers: [input.containerNameOrId] })
        );

        return {
            containers: containers.map(container => ({
                ...container,
                createdAt: container.createdAt.toISOString(),
            })),
        };
    },
};

