/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { CopilotTool } from '@microsoft/vscode-inproc-mcp';
import { z } from 'zod';
import { ext } from '../../../extensionVariables';
import { UnspecifiedOutputSchema } from '../common';

export const listContainersTool: CopilotTool<z.ZodVoid, typeof UnspecifiedOutputSchema> = {
    name: 'list_containers',
    outputSchema: UnspecifiedOutputSchema,
    description: 'List containers, including stopped ones',
    annotations: {
        readOnlyHint: true,
    },
    execute: async () => {
        const containers = await ext.runWithDefaults(client =>
            client.listContainers({ all: true })
        );

        return {
            containers: containers.map(container => ({
                ...container,
                createdAt: container.createdAt?.toISOString(),
            })),
        };
    },
};

