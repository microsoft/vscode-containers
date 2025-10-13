/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { CopilotTool } from '@microsoft/vscode-inproc-mcp';
import { ext } from '../../../extensionVariables';
import { ImageRefSchema, isoTheCreatedAt, UnspecifiedOutputSchema } from '../common';

const InspectImagesInputSchema = ImageRefSchema;

export const inspectImageTool: CopilotTool<typeof InspectImagesInputSchema, typeof UnspecifiedOutputSchema> = {
    name: 'inspect_image',
    inputSchema: InspectImagesInputSchema,
    outputSchema: UnspecifiedOutputSchema,
    description: 'Inspect a container image by name or ID',
    annotations: {
        readOnlyHint: true,
    },
    execute: async (input, extras) => {
        const images = await ext.runWithDefaults(client =>
            client.inspectImages({ imageRefs: [input.imageNameOrId] }),
            { cancellationToken: extras.token }
        );

        return {
            images: isoTheCreatedAt(images),
        };
    },
};

