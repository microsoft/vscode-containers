/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { CopilotTool } from '@microsoft/vscode-inproc-mcp';
import { z } from 'zod';
import { ext } from '../../../extensionVariables';
import { ImageRefSchema } from '../common';

const ActImageInputSchema = ImageRefSchema.extend({
    action: z.enum(['pull', 'remove']).describe('The action to perform on the container image'),
});

export const actImageTool: CopilotTool<typeof ActImageInputSchema, z.ZodVoid> = {
    name: 'act_image',
    inputSchema: ActImageInputSchema,
    description: 'Pull or remove a container image by name or ID',
    annotations: {
        destructiveHint: true,
        idempotentHint: true,
    },
    execute: async (input) => {
        switch (input.action) {
            case 'pull':
                await ext.runWithDefaults(client =>
                    client.pullImage({ imageRef: input.imageNameOrId })
                );
                return;
            case 'remove':
                await ext.runWithDefaults(client =>
                    client.removeImages({ imageRefs: [input.imageNameOrId], force: true })
                );
                return;
            default:
                throw new Error(`Unknown action: ${input.action}`);
        }
    },
};
