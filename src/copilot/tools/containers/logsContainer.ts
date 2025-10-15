/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { CopilotTool } from '@microsoft/vscode-inproc-mcp';
import { UnspecifiedOutputSchema } from '@microsoft/vscode-inproc-mcp/mcp';
import { ext } from '../../../extensionVariables';
import { ContainerRefSchema } from '../common';

const LogsContainerInputSchema = ContainerRefSchema;

export const logsContainerTool: CopilotTool<typeof LogsContainerInputSchema, typeof UnspecifiedOutputSchema> = {
    name: 'logs_for_container',
    inputSchema: LogsContainerInputSchema,
    outputSchema: UnspecifiedOutputSchema,
    description: 'View logs for a container by name or ID',
    annotations: {
        readOnlyHint: true,
    },
    execute: async (input, extras) => {
        const logGen = ext.streamWithDefaults(client =>
            client.logsForContainer({ container: input.containerNameOrId, follow: false, tail: 500 }), // TODO: it'd be nice if we could adjust the tail length by user preference or model capacity
            { cancellationToken: extras.token }
        );

        const logs: string[] = [];
        for await (const log of logGen) {
            logs.push(log);
        }

        return {
            logs: logs.join(''),
        };
    },
};
