/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { CopilotTool } from '@microsoft/vscode-inproc-mcp';
import { z } from 'zod';
import { ext } from '../../extensionVariables';

const ActInSchema = z.object({
    action: z.enum(['start', 'stop', 'restart']),
    containerNameOrId: z.string().min(1),
});

const ActOutSchema = z.void();

export const actContainerTool: CopilotTool<typeof ActInSchema, typeof ActOutSchema> = {
    name: 'act_container',
    inputSchema: ActInSchema,
    outputSchema: ActOutSchema,
    description: 'Start, stop, or restart a container by name or ID.',
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
            default:
                throw new Error(`Unknown action: ${input.action}`);
        }
    },
};
