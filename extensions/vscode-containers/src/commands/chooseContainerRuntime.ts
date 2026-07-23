/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IActionContext, IAzureQuickPickItem } from '@microsoft/vscode-azext-utils';
import { DockerClient, DockerComposeClient, IContainerOrchestratorClient, IContainersClient, PodmanClient, PodmanComposeClient } from '@microsoft/vscode-container-client';
import * as vscode from 'vscode';
import { configPrefix } from '../constants';

interface IContainerRuntimePair {
    containerClient: IContainersClient;
    orchestratorClient: IContainerOrchestratorClient;
}

export async function chooseContainerRuntime(context: IActionContext): Promise<void> {
    const runtimePairOptions: IContainerRuntimePair[] = [
        { containerClient: new DockerClient(), orchestratorClient: new DockerComposeClient() },
        { containerClient: new PodmanClient(), orchestratorClient: new PodmanComposeClient() },
    ];

    const configuration = vscode.workspace.getConfiguration(configPrefix);
    const oldContainerClientValue = configuration.get<string | undefined>('containerClient');
    const oldOrchestratorClientValue = configuration.get<string | undefined>('orchestratorClient');

    const runtimePairPicks: IAzureQuickPickItem<IContainerRuntimePair>[] = runtimePairOptions.map((runtimePair) => {
        return {
            label: runtimePair.containerClient.displayName,
            data: runtimePair,
            description: runtimePair.containerClient.description,
        };
    });

    const selectedRuntimePair = await context.ui.showQuickPick(runtimePairPicks, {
        placeHolder: 'Choose a container runtime',
        suppressPersistence: true,
    });

    context.telemetry.properties.selectedRuntime = selectedRuntimePair.data.containerClient.displayName;

    if (oldContainerClientValue === selectedRuntimePair.data.containerClient.id && oldOrchestratorClientValue === selectedRuntimePair.data.orchestratorClient.id) {
        // If there's no change, we don't need to do anything
        return;
    } else {
        await configuration.update('containerClient', selectedRuntimePair.data.containerClient.id, vscode.ConfigurationTarget.Global);
        await configuration.update('orchestratorClient', selectedRuntimePair.data.orchestratorClient.id, vscode.ConfigurationTarget.Global);
    }

    const reload: vscode.MessageItem = {
        title: vscode.l10n.t('Reload Now'),
    };
    const later: vscode.MessageItem = {
        title: vscode.l10n.t('Later'),
    };

    const message = vscode.l10n.t('The container runtime has been changed to {0}. A reload is required for the updated container runtime to take effect. Do you want to reload now? Please save your work before proceeding.', selectedRuntimePair.data.containerClient.displayName);

    const reloadChoice = await context.ui.showWarningMessage(message, reload, later);

    if (reloadChoice === reload) {
        await vscode.commands.executeCommand('workbench.action.reloadWindow');
    }
}
