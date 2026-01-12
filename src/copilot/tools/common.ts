/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationError } from '@microsoft/vscode-processutils';
import * as vscode from 'vscode';
import { z } from 'zod';

export const ContainerRefSchema = z.object({
    containerNameOrId: z.string().describe('The container name or ID'),
});

export const ImageRefSchema = z.object({
    imageNameOrId: z.string().describe('The container image name or ID'),
});

export function isoTheCreatedAt<T extends { createdAt?: Date }>(items: T[]) {
    return items.map(item => ({
        ...item,
        createdAt: item.createdAt?.toISOString(),
    }));
}

export async function selectWorkspaceFolder(message?: string): Promise<vscode.WorkspaceFolder> {
    if (vscode.workspace.workspaceFolders?.length === 1) {
        return vscode.workspace.workspaceFolders[0];
    } else if (vscode.workspace.workspaceFolders?.length) {
        // TODO: can we use elicitations here?
        const workspaceFolder = await vscode.window.showWorkspaceFolderPick({
            placeHolder: message || vscode.l10n.t('Select the workspace folder to use for this operation'),
            ignoreFocusOut: true,
        });

        if (!workspaceFolder) {
            throw new CancellationError(vscode.l10n.t('A workspace folder must be selected.'));
        }

        return workspaceFolder;
    } else {
        throw new CancellationError(vscode.l10n.t('A workspace folder must be opened.'));
    }
}
