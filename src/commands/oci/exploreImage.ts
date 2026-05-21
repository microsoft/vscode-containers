/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IActionContext, UserCancelledError } from '@microsoft/vscode-azext-utils';
import { CommonRegistry, CommonTag } from '@microsoft/vscode-docker-registries';
import * as vscode from 'vscode';
import { ext } from '../../extensionVariables';
import { exportImageToOciLayout } from '../../oci/ociExport';
import { ImageTreeItem } from '../../tree/images/ImageTreeItem';
import { UnifiedRegistryItem } from '../../tree/registries/UnifiedRegistryTreeDataProvider';
import { getFullImageNameFromRegistryTagItem } from '../../tree/registries/registryTreeUtils';
import { registryExperience } from '../../utils/registryExperience';
import { logInToDockerCli } from '../registries/logInToDockerCli';

type ExploreImageMode = 'folder' | 'daemon' | 'registry';

async function promptForExploreMode(): Promise<ExploreImageMode | undefined> {
    const selection = await vscode.window.showQuickPick(
        [
            { label: vscode.l10n.t('Open OCI layout folder'), mode: 'folder' as const },
            { label: vscode.l10n.t('Use image from container runtime'), mode: 'daemon' as const },
            { label: vscode.l10n.t('Pull image from connected registry'), mode: 'registry' as const },
        ],
        {
            placeHolder: vscode.l10n.t('Explore Image: choose an image source'),
            ignoreFocusOut: true,
        }
    );

    return selection?.mode;
}

async function promptForLayoutFolder(): Promise<string | undefined> {
    const selected = await vscode.window.showOpenDialog({
        canSelectFiles: false,
        canSelectFolders: true,
        canSelectMany: false,
        openLabel: vscode.l10n.t('Open OCI Layout Folder'),
    });

    return selected && selected[0] ? selected[0].fsPath : undefined;
}

export async function exploreImage(context: IActionContext): Promise<void> {
    const mode = await promptForExploreMode();
    if (!mode) {
        throw new UserCancelledError('ociExploreModeSelection');
    }

    if (mode === 'folder') {
        const rootPath = await promptForLayoutFolder();
        if (!rootPath) {
            throw new UserCancelledError('ociFolderSelection');
        }
        await ext.ociRoot.setRootPath(rootPath, context);
        await vscode.commands.executeCommand('vscode-containers.views.ociLayout.focus');
        return;
    }

    let reference: string;

    if (mode === 'daemon') {
        await ext.imagesTree.refresh(context);
        const node = await ext.imagesTree.showTreeItemPicker<ImageTreeItem>(
            ImageTreeItem.contextValue,
            {
                ...context,
                noItemFoundErrorMessage: vscode.l10n.t('No images are available to export'),
            }
        );
        reference = node.fullTag || node.imageId;
    } else {
        const tagNode = await registryExperience<CommonTag>(context, {
            contextValueFilter: { include: /commontag/i },
        });
        await logInToDockerCli(
            context,
            tagNode.parent.parent as unknown as UnifiedRegistryItem<CommonRegistry>
        );
        reference = getFullImageNameFromRegistryTagItem(tagNode.wrappedItem);
    }

    if (!reference) {
        throw new UserCancelledError('ociImageReferenceSelection');
    }

    const outputDir = await vscode.window.withProgress(
        {
            location: vscode.ProgressLocation.Notification,
            title:
                mode === 'registry'
                    ? vscode.l10n.t('Copying {0} from registry to OCI layout…', reference)
                    : vscode.l10n.t('Exporting {0} to OCI layout…', reference),
            cancellable: false,
        },
        () =>
            exportImageToOciLayout(reference, {
                source: mode === 'registry' ? 'registry' : 'docker-daemon',
            })
    );

    await ext.ociRoot.setRootPath(outputDir, context);
    await vscode.commands.executeCommand('vscode-containers.views.ociLayout.focus');
}
