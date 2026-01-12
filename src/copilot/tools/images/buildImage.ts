/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { BuildImageCommandOptions } from '@microsoft/vscode-container-client';
import type { CopilotTool } from '@microsoft/vscode-inproc-mcp';
import * as vscode from 'vscode';
import { z } from 'zod';
import { ext } from '../../../extensionVariables';
import { TaskCommandRunnerFactory } from '../../../runtimes/runners/TaskCommandRunnerFactory';
import { selectWorkspaceFolder } from '../common';

const BuildImageInputSchema = z.object({
    path: z.string().optional().describe('The path to the directory containing the build context. Defaults to the current workspace directory.'), // TODO: how?
    dockerfile: z.string().optional().describe('The path to the Dockerfile to use. Defaults to "./Dockerfile" in the build context.'),
    tags: z.array(z.string()).optional().describe('A list of tags to apply to the built image.'),
    stage: z.string().optional().describe('The build stage to target if the Dockerfile has multiple stages.'),
    pull: z.boolean().optional().describe('Whether to attempt to pull a newer version of the base image. Defaults to true.'),
});

export const buildImageTool: CopilotTool<typeof BuildImageInputSchema, z.ZodVoid> = {
    name: 'build_image',
    inputSchema: BuildImageInputSchema,
    description: 'Build a container image',
    annotations: {
        destructiveHint: true, // Building an image is not necessarily destructive, but it might be (e.g. if it replaces an existing image)
        idempotentHint: true,
    },
    execute: async (input, extras) => {
        input.path ||= (await selectWorkspaceFolder(vscode.l10n.t('Select the workspace folder to use as the build context'))).uri.fsPath;

        const buildOptions: BuildImageCommandOptions = {
            path: input.path,
            file: input.dockerfile,
            tags: input.tags,
            stage: input.stage,
            pull: !!input.pull,
        };

        const client = await ext.runtimeManager.getClient();
        const taskCRF = new TaskCommandRunnerFactory(
            {
                taskName: input.tags?.length > 0 ? vscode.l10n.t('Build {0}', input.tags[0]) : vscode.l10n.t('Build Container Image'),
                cwd: input.path,
                focus: true,
            }
        );

        // Don't wait--the task will run interactively but we don't want to block the agent forever
        void taskCRF.getCommandRunner()(
            client.buildImage(buildOptions)
            // Cancellation is intentionally ignored--cancelling the Copilot task shouldn't stop the build
        );
    },
};
