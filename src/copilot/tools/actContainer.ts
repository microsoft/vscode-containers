/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { CopilotTool } from '@microsoft/vscode-inproc-mcp';
import { z } from 'zod';
import { ext } from '../../extensionVariables';

const ActInSchema = z.object({
    action: z.enum(['start', 'stop', 'restart', 'remove']),
    containerNameOrId: z.string(),
});

export const actContainerTool: CopilotTool<typeof ActInSchema, z.ZodVoid> = {
    name: 'act_container',
    inputSchema: ActInSchema,
    description: 'Start, stop, restart or remove a container by name or ID.',
    annotations: {
        destructiveHint: true, // Container stop could result in removal, so mark as destructive
        idempotentHint: true,
    },
    execute: async (input: z.infer<typeof ActInSchema>) => {
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
