/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IActionContext } from '@microsoft/vscode-azext-utils';
import * as path from 'path';
import * as vscode from 'vscode';
import { ext } from '../../extensionVariables';

export async function showOciPrerequisitesHelp(_context: IActionContext): Promise<void> {
    const helpFile = vscode.Uri.file(
        path.join(ext.context.asAbsolutePath('resources'), 'oci', 'OciPrerequisites.md')
    );
    await vscode.commands.executeCommand('markdown.showPreview', helpFile);
}
