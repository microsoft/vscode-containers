/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DialogResponses, IActionContext } from '@microsoft/vscode-azext-utils';
import { ProgressLocation, l10n, window } from 'vscode';
import { ext } from '../../../extensionVariables';
import { AzureRegistry, AzureRegistryDataProvider } from '../../../tree/registries/Azure/AzureRegistryDataProvider';
import { UnifiedRegistryItem } from '../../../tree/registries/UnifiedRegistryTreeDataProvider';
import { registryExperience } from '../../../utils/registryExperience';

export async function deleteAzureRegistry(context: IActionContext, node?: UnifiedRegistryItem<AzureRegistry>): Promise<void> {
    if (!node) {
        node = await registryExperience<AzureRegistry>(context, {
            contextValueFilter: { include: /commonregistry/i },
            registryFilter: { include: [ext.azureRegistryDataProvider.label] }
        });
    }

    const registryName = node.wrappedItem.label;

    const confirmDelete: string = l10n.t('Are you sure you want to delete registry "{0}" and its associated images?', registryName);
    // no need to check result - cancel will throw a UserCancelledError
    await context.ui.showWarningMessage(confirmDelete, { modal: true }, DialogResponses.deleteResponse);

    const deleting = l10n.t('Deleting registry "{0}"...', registryName);
    await window.withProgress({ location: ProgressLocation.Notification, title: deleting }, async () => {
        const azureRegistryDataProvider = node.provider as unknown as AzureRegistryDataProvider;
        await azureRegistryDataProvider.deleteRegistry(node.wrappedItem);
    });

    void ext.registriesTree.refresh();

    const message = l10n.t('Successfully deleted registry "{0}".', registryName);
    // don't wait
    void window.showInformationMessage(message);
}
