/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IActionContext, IAzureQuickPickItem, nonNullValue } from '@microsoft/vscode-azext-utils';
import * as vscode from 'vscode';
import { ext } from '../../../extensionVariables';
import { AzureRegistry, AzureSubscriptionRegistryItem } from '../../../tree/registries/Azure/AzureRegistryDataProvider';
import { UnifiedRegistryItem } from '../../../tree/registries/UnifiedRegistryTreeDataProvider';
import { createAzureRegistry } from './createAzureRegistry';

/**
 * Prompts the user to select an Azure Container Registry within the given subscription, offering an
 * option to create a new one. Returns the selected (or newly created) registry node.
 */
export async function pickAcr(context: IActionContext, subscriptionNode: UnifiedRegistryItem<AzureSubscriptionRegistryItem>): Promise<UnifiedRegistryItem<AzureRegistry>> {
    const acrs = await ext.registriesRoot.getChildren(subscriptionNode) as UnifiedRegistryItem<AzureRegistry>[];
    const picks: IAzureQuickPickItem<string | UnifiedRegistryItem<AzureRegistry>>[] = acrs.map(acr => <IAzureQuickPickItem<UnifiedRegistryItem<AzureRegistry>>>{ label: acr.wrappedItem.label, data: acr });
    picks.push({ label: vscode.l10n.t('$(plus) Create new Azure Container Registry...'), data: 'create' });

    const response = await context.ui.showQuickPick(picks, { placeHolder: vscode.l10n.t('Select an Azure Container Registry to push to') });

    if (response.data === 'create') {
        const createdAcrName = await createAzureRegistry(context, subscriptionNode);

        const acrNodes = await ext.registriesRoot.getChildren(subscriptionNode) as UnifiedRegistryItem<AzureRegistry>[];
        return nonNullValue(acrNodes.find(acrNode => acrNode.wrappedItem.label === createdAcrName), 'createdAcrNode');
    } else {
        return response.data as UnifiedRegistryItem<AzureRegistry>;
    }
}
