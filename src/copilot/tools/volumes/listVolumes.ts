/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { CopilotTool } from '@microsoft/vscode-inproc-mcp';
import { z } from 'zod';
import { ext } from '../../../extensionVariables';
import { UnspecifiedOutputSchema } from '../common';

export const listVolumesTool: CopilotTool<z.ZodVoid, typeof UnspecifiedOutputSchema> = {
    name: 'list_volumes',
    outputSchema: UnspecifiedOutputSchema,
    description: 'List container volumes',
    annotations: {
        readOnlyHint: true,
    },
    execute: async (input, extras) => {
        const volumes = await ext.runWithDefaults(client =>
            client.listVolumes({}),
            { cancellationToken: extras.token }
        );

        return {
            volumes: volumes.map(volume => ({
                ...volume,
                createdAt: volume.createdAt?.toISOString(),
            })),
        };
    },
};

