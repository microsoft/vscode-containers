/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { CopilotTool } from '@microsoft/vscode-inproc-mcp';
import { UnspecifiedOutputSchema } from '@microsoft/vscode-inproc-mcp/mcp';
import { ext } from '../../../extensionVariables';
import { ContainerRefSchema, isoTheCreatedAt } from '../common';

const InspectContainersInputSchema = ContainerRefSchema;

export const inspectContainerTool: CopilotTool<typeof InspectContainersInputSchema, typeof UnspecifiedOutputSchema> = {
    name: 'inspect_container',
    inputSchema: InspectContainersInputSchema,
    outputSchema: UnspecifiedOutputSchema,
    description: 'Inspect a container by name or ID',
    annotations: {
        readOnlyHint: true,
    },
    execute: async (input, extras) => {
        const containers = await ext.runWithDefaults(client =>
            client.inspectContainers({ containers: [input.containerNameOrId] }),
            { cancellationToken: extras.token }
        );

        return {
            containers: isoTheCreatedAt(containers),
        };
    },
};
