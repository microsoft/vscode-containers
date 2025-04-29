/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IActionContext, IAzureQuickPickItem } from '@microsoft/vscode-azext-utils';
import { DockerClient, IContainersClient, PodmanClient } from '@microsoft/vscode-container-client';
import * as vscode from 'vscode';
import { configPrefix } from '../constants';

export async function chooseContainerRuntime(context: IActionContext): Promise<void> {
    const clientOptions = [
        new DockerClient(),
        new PodmanClient(),
    ];

    const containerRuntimeChoices: IAzureQuickPickItem<IContainersClient>[] = clientOptions.map((client) => {
        return {
            label: client.displayName,
            data: client,
            description: client.description,
        };
    });

    const selectedClient = await context.ui.showQuickPick(containerRuntimeChoices, {
        placeHolder: 'Choose a container runtime',
        suppressPersistence: true,
    });

    context.telemetry.properties.selectedRuntime = selectedClient.data.displayName;

    const configuration = vscode.workspace.getConfiguration(configPrefix);
    await configuration.update('containerClient', selectedClient.data.id);


    const reload: vscode.MessageItem = {
        title: vscode.l10n.t('Reload Now'),
    };
    const later: vscode.MessageItem = {
        title: vscode.l10n.t('Later'),
    };

    const message = vscode.l10n.t('The container runtime has been changed to {0}. A reload is required for the setting to take effect. Do you want to reload now? Please save your work before proceeding.', selectedClient.data.displayName);

    const reloadChoice = await context.ui.showWarningMessage(message, reload, later);

    if (reloadChoice === reload) {
        await vscode.commands.executeCommand('workbench.action.reloadWindow');
    }
}
