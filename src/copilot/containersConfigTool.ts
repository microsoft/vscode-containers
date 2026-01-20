/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzExtLMTool, IActionContext } from '@microsoft/vscode-azext-utils';
import * as vscode from 'vscode';
import { configPrefix } from '../constants';
import { ext } from '../extensionVariables';
import { isComposeV2ableOrchestratorClient } from '../runtimes/clients/AutoConfigurableDockerComposeClient';

export class ContainersConfigTool implements AzExtLMTool<void> {
    public async invoke(context: IActionContext, options: vscode.LanguageModelToolInvocationOptions<void>, token: vscode.CancellationToken): Promise<vscode.LanguageModelToolResult> {
        context.errorHandling.suppressDisplay = true;

        const containerClient = await ext.runtimeManager.getClient();
        const orchestratorClient = await ext.orchestratorManager.getClient();
        const envConfig = vscode.workspace.getConfiguration(configPrefix).get<Record<string, string>>('environment', {});

        let orchestratorCommand: string;
        if (isComposeV2ableOrchestratorClient(orchestratorClient) && orchestratorClient.composeV2) {
            orchestratorCommand = `${orchestratorClient.commandName} compose`;
        } else {
            orchestratorCommand = orchestratorClient.commandName;
        }

        const results = [
            new vscode.LanguageModelTextPart(`Use the following base command for the container CLI: \`${containerClient.commandName}\``),
            new vscode.LanguageModelTextPart(`Use the following base command for the container orchestrator (compose) CLI: \`${orchestratorCommand}\``),
        ];

        if (Object.keys(envConfig).length > 0) {
            context.telemetry.properties.hasEnvConfig = 'true';
            results.push(new vscode.LanguageModelTextPart(`The following environment variables will be set automatically for new terminals created by the agent: \`\`\`json\n${JSON.stringify(envConfig)}\n\`\`\``));
        }

        return new vscode.LanguageModelToolResult(results);
    }
}
