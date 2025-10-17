/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { CopilotTool } from '@microsoft/vscode-inproc-mcp';
import { z } from 'zod';
import { ext } from '../../../extensionVariables';

const PruneInputSchema = z.object({
    pruneTarget: z.enum(['containers', 'images', 'volumes', 'networks', 'all']).describe('The type of resource to prune'),
});

export const pruneTool: CopilotTool<typeof PruneInputSchema, z.ZodVoid> = {
    name: 'prune',
    inputSchema: PruneInputSchema,
    description: 'Prune unused container resources',
    annotations: {
        destructiveHint: true, // Pruning is a destructive action
        idempotentHint: true,
    },
    execute: async (input, extras) => {
        if (input.pruneTarget === 'containers' || input.pruneTarget === 'all') {
            await ext.runWithDefaults(client =>
                client.pruneContainers({}),
                { cancellationToken: extras.token }
            );
        }

        if (input.pruneTarget === 'images' || input.pruneTarget === 'all') {
            await ext.runWithDefaults(client =>
                client.pruneImages({ all: false }), // Only remove dangling images
                { cancellationToken: extras.token }
            );
        }

        if (input.pruneTarget === 'volumes' || input.pruneTarget === 'all') {
            await ext.runWithDefaults(client =>
                client.pruneVolumes({}),
                { cancellationToken: extras.token }
            );
        }

        if (input.pruneTarget === 'networks' || input.pruneTarget === 'all') {
            await ext.runWithDefaults(client =>
                client.pruneNetworks({}),
                { cancellationToken: extras.token }
            );
        }
    },
};
