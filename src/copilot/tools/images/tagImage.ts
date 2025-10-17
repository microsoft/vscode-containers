/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { CopilotTool } from '@microsoft/vscode-inproc-mcp';
import { z } from 'zod';
import { ext } from '../../../extensionVariables';
import { ImageRefSchema } from '../common';

const TagImageInputSchema = ImageRefSchema.extend({
    tag: z.string().describe('The tag to apply to the container image'),
});

export const tagImageTool: CopilotTool<typeof TagImageInputSchema, z.ZodVoid> = {
    name: 'tag_image',
    inputSchema: TagImageInputSchema,
    description: 'Tag a container image with a new tag',
    annotations: {
        idempotentHint: true,
        readOnlyHint: false, // Not read-only
        destructiveHint: false, // But not destructive either
    },
    execute: async (input, extras) => {
        await ext.runWithDefaults(client =>
            client.tagImage({ fromImageRef: input.imageNameOrId, toImageRef: input.tag }),
            { cancellationToken: extras.token }
        );
    },
};
