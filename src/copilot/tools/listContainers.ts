/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { CopilotTool } from '@microsoft/vscode-inproc-mcp';
import { z } from 'zod';
import { ext } from '../../extensionVariables';
import { ImageInfoSchema, PortBindingSchema } from './common';

const ListContainersOutputSchema = z.object({
    containers: z.array(
        z.object({
            id: z.string(),
            name: z.string(),
            labels: z.record(z.string()).nullish(),
            image: ImageInfoSchema,
            ports: z.array(PortBindingSchema).nullish(),
            networks: z.array(z.string()).nullish(),
            createdAt: z.string(),
            state: z.string(),
            status: z.string().nullish(),
        }).passthrough()
    ),
});

export const listContainersTool: CopilotTool<z.ZodVoid, typeof ListContainersOutputSchema> = {
    name: 'list_containers',
    outputSchema: ListContainersOutputSchema,
    description: 'List containers',
    annotations: {
        readOnlyHint: true,
    },
    execute: async () => {
        const containers = await ext.runWithDefaults(client =>
            client.listContainers({})
        );

        return {
            containers: containers.map(container => ({
                ...container,
                createdAt: new Date(container.createdAt).toISOString(),
            })),
        };
    },
};

