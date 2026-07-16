/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { isMac, isWindows } from '../utils/osUtils';

export async function openDockerDownloadPage(): Promise<void> {
    if (isWindows()) {
        await vscode.env.openExternal(vscode.Uri.parse('https://aka.ms/vscode/docker-windows-download'));
    } else if (isMac()) {
        await vscode.env.openExternal(vscode.Uri.parse('https://aka.ms/vscode/docker-mac-download'));
    } else {
        await vscode.env.openExternal(vscode.Uri.parse('https://aka.ms/download-docker-linux-vscode'));
    }
}

