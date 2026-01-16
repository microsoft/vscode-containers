/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { CopilotTool } from '@microsoft/vscode-inproc-mcp';
import * as vscode from 'vscode';
import { z } from 'zod';
import { ext } from '../../../extensionVariables';
import { TaskCommandRunnerFactory } from '../../../runtimes/runners/TaskCommandRunnerFactory';
import { ContainerRefSchema } from '../common';

const ActComposeInputSchema = ContainerRefSchema.extend({
    action: z.enum(['up', 'down', 'start', 'stop']).describe('The action to perform on the set of services'),
    composeFiles: z.array(z.string()).optional().describe('Paths to one or more Docker Compose files. If relative paths are given, they are treated as relative to the current workspace folder.'),
    // TODO: compose file path?
    // TODO: up options?
});

export const actComposeTool: CopilotTool<typeof ActComposeInputSchema, z.ZodVoid> = {
    name: 'act_compose',
    inputSchema: ActComposeInputSchema,
    description: 'Bring up, down, start, or stop a set of services defined in a Docker Compose file',
    annotations: {
        destructiveHint: true, // Container stop can also result in removal, so mark as destructive
        idempotentHint: true,
    },
    execute: async (input, extras) => {
        const client = await ext.orchestratorManager.getClient();
        const taskCRF = new TaskCommandRunnerFactory(
            {
                taskName: vscode.l10n.t('Compose {0}', input.action),
            }
        );

        switch (input.action) {
            case 'up':
                void taskCRF.getCommandRunner()(
                    client.up({
                        // TODO
                    })
                );
                return;
            case 'down':
                void taskCRF.getCommandRunner()(
                    client.down({
                        // TODO
                    })
                );
                return;
            case 'start':
                void taskCRF.getCommandRunner()(
                    client.start({
                        // TODO
                    })
                );
                return;
            case 'stop':
                void taskCRF.getCommandRunner()(
                    client.stop({
                        // TODO
                    })
                );
                return;
            default:
                throw new Error(`Unknown action: ${input.action}`);
        }
    },
};
