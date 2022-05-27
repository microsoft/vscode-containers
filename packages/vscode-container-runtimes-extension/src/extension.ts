/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { PodmanClient, getDockerExtensionExport } from '@microsoft/vscode-container-runtimes';
import { localize } from './localize';

export async function activate(context: vscode.ExtensionContext): Promise<void> {
    try {
        const dockerExtension = await getDockerExtensionExport();
        context.subscriptions.push(dockerExtension.registerContainerRuntimeClient(new PodmanClient()));
    } catch (error) {
        const outputChannel = vscode.window.createOutputChannel(
            localize('container-runtimes.outputChannel', 'Container Runtimes Provider')
        );

        outputChannel.appendLine(
            localize('container-runtimes.registrationError', 'Failed to register container runtime client with error: {0}', String(error))
        );
    }
}

export function deactivate(): void {
    // No-op
}
