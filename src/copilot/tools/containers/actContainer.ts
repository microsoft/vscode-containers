/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { CopilotTool } from '@microsoft/vscode-inproc-mcp';
import { z } from 'zod';
import { ext } from '../../../extensionVariables';
import { ContainerRefSchema } from '../common';

const ActContainerInputSchema = ContainerRefSchema.extend({
    action: z.enum(['start', 'stop', 'restart', 'remove']).describe('The action to perform on the container'),
});

export const actContainerTool: CopilotTool<typeof ActContainerInputSchema, z.ZodVoid> = {
    name: 'act_container',
    inputSchema: ActContainerInputSchema,
    description: 'Start, stop, restart or remove a container by name or ID',
    annotations: {
        destructiveHint: true, // Container stop can also result in removal, so mark as destructive
        idempotentHint: true,
    },
    execute: async (input) => {
        switch (input.action) {
            case 'start':
                await ext.runWithDefaults(client =>
                    client.startContainers({ container: [input.containerNameOrId] })
                );
                return;
            case 'stop':
                await ext.runWithDefaults(client =>
                    client.stopContainers({ container: [input.containerNameOrId] })
                );
                return;
            case 'restart':
                await ext.runWithDefaults(client =>
                    client.restartContainers({ container: [input.containerNameOrId] })
                );
                return;
            case 'remove':
                await ext.runWithDefaults(client =>
                    client.removeContainers({ containers: [input.containerNameOrId], force: true })
                );
                return;
            default:
                throw new Error(`Unknown action: ${input.action}`);
        }
    },
};
