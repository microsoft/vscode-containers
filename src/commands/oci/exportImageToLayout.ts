/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IActionContext } from '@microsoft/vscode-azext-utils';
import * as vscode from 'vscode';
import { ext } from '../../extensionVariables';
import { exportImageToOciLayout } from '../../oci/ociExport';
import { ImageTreeItem } from '../../tree/images/ImageTreeItem';

export async function exportImageToLayout(
    context: IActionContext,
    node?: ImageTreeItem
): Promise<void> {
    if (!node) {
        await ext.imagesTree.refresh(context);
        node = await ext.imagesTree.showTreeItemPicker<ImageTreeItem>(ImageTreeItem.contextValue, {
            ...context,
            noItemFoundErrorMessage: vscode.l10n.t('No images are available to export'),
        });
    }

    const reference = node.fullTag || node.imageId;
    if (!reference) {
        void vscode.window.showErrorMessage(vscode.l10n.t('Could not determine image reference.'));
        return;
    }

    const outputDir = await vscode.window.withProgress(
        {
            location: vscode.ProgressLocation.Notification,
            title: vscode.l10n.t('Exporting {0} to OCI layout…', reference),
            cancellable: false,
        },
        () => exportImageToOciLayout(reference)
    );

    await ext.ociRoot.setRootPath(outputDir, context);
    await vscode.commands.executeCommand('vscode-containers.views.ociLayout.focus');
}
