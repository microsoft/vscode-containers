/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { CopilotTool } from '@microsoft/vscode-inproc-mcp';
import { z } from 'zod';
import { ext } from '../../../extensionVariables';
import { isoTheCreatedAt, UnspecifiedOutputSchema } from '../common';

export const listImagesTool: CopilotTool<z.ZodVoid, typeof UnspecifiedOutputSchema> = {
    name: 'list_images',
    outputSchema: UnspecifiedOutputSchema,
    description: 'List container images, including untagged and orphaned ones',
    annotations: {
        readOnlyHint: true,
    },
    execute: async (input, extras) => {
        const images = await ext.runWithDefaults(client =>
            client.listImages({ all: true }),
            { cancellationToken: extras.token }
        );

        return {
            images: isoTheCreatedAt(images),
        };
    },
};
