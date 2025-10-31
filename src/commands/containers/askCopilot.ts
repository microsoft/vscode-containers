/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IActionContext } from '@microsoft/vscode-azext-utils';
import * as vscode from 'vscode';
import { ContainerTreeItem } from '../../tree/containers/ContainerTreeItem';
import { ImageTreeItem } from '../../tree/images/ImageTreeItem';

export async function askCopilot(context: IActionContext, node?: ContainerTreeItem | ImageTreeItem): Promise<void> {
    let prompt: string;
    if (node instanceof ContainerTreeItem) {
        context.telemetry.properties.nodeType = 'container';
        prompt = vscode.l10n.t('I want to talk about my container `{0}` (ID: `{1}`)', node.containerName, node.containerId.slice(0, 12));
    } else if (node instanceof ImageTreeItem) {
        context.telemetry.properties.nodeType = 'image';
        prompt = vscode.l10n.t('I want to talk about my container image `{0}` (ID: `{1}`)', node.fullTag, node.imageId.slice(7, 19)); // Image id starts with "sha256:"
    } else {
        throw new Error('askCopilot command can only be invoked on a container or image node.');
    }

    await vscode.commands.executeCommand("workbench.action.chat.newChat");
    await vscode.commands.executeCommand("workbench.action.chat.open", { query: prompt });
}
