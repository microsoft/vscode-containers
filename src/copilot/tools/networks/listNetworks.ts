/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { CopilotTool } from '@microsoft/vscode-inproc-mcp';
import { z } from 'zod';
import { ext } from '../../../extensionVariables';
import { isoTheCreatedAt, UnspecifiedOutputSchema } from '../common';

export const listNetworksTool: CopilotTool<z.ZodVoid, typeof UnspecifiedOutputSchema> = {
    name: 'list_networks',
    outputSchema: UnspecifiedOutputSchema,
    description: 'List container networks',
    annotations: {
        readOnlyHint: true,
    },
    execute: async (input, extras) => {
        const networks = await ext.runWithDefaults(client =>
            client.listNetworks({}),
            { cancellationToken: extras.token }
        );

        return {
            networks: isoTheCreatedAt(networks),
        };
    },
};

