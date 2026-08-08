/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzureWizardPromptStep, IActionContext, IAzureQuickPickItem, nonNullValue } from '@microsoft/vscode-azext-utils';
import { CommonRegistry } from '@microsoft/vscode-docker-registries';
import * as vscode from 'vscode';
import { ext } from '../../../extensionVariables';
import { AzureRegistry, AzureSubscriptionRegistryItem } from '../../../tree/registries/Azure/AzureRegistryDataProvider';
import { UnifiedRegistryItem } from '../../../tree/registries/UnifiedRegistryTreeDataProvider';
import { createAzureRegistry } from '../../registries/azure/tasks/createAzureRegistry';
import { PushImageWizardContext } from './PushImageWizardContext';

export interface PickAcrWizardContext extends IActionContext {
    connectedRegistry?: UnifiedRegistryItem<CommonRegistry>;
    azureSubscriptionNode?: UnifiedRegistryItem<AzureSubscriptionRegistryItem>;
}

export class CreatePickAcrPromptStep<T extends PickAcrWizardContext = PushImageWizardContext> extends AzureWizardPromptStep<T> {
    public async prompt(wizardContext: T): Promise<void> {
        const subscriptionNode = nonNullValue(wizardContext.azureSubscriptionNode, 'azureSubscriptionNode');
        const acrs = await ext.registriesRoot.getChildren(subscriptionNode) as UnifiedRegistryItem<AzureRegistry>[];
        const picks: IAzureQuickPickItem<string | UnifiedRegistryItem<AzureRegistry>>[] = acrs.map(acr => <IAzureQuickPickItem<UnifiedRegistryItem<AzureRegistry>>>{ label: acr.wrappedItem.label, data: acr });
        picks.push({ label: vscode.l10n.t('$(plus) Create new Azure Container Registry...'), data: 'create' });

        const response = await wizardContext.ui.showQuickPick(picks, { placeHolder: vscode.l10n.t('Select an Azure Container Registry') });

        if (response.data === 'create') {
            const createdAcrName = await createAzureRegistry(wizardContext, subscriptionNode);
            const acrNodes = await ext.registriesRoot.getChildren(subscriptionNode) as UnifiedRegistryItem<AzureRegistry>[];
            wizardContext.connectedRegistry = nonNullValue(acrNodes.find(acrNode => acrNode.wrappedItem.label === createdAcrName), 'createdAcrNode');
        } else {
            wizardContext.connectedRegistry = response.data as UnifiedRegistryItem<AzureRegistry>;
        }
    }

    public shouldPrompt(wizardContext: T): boolean {
        return !!wizardContext.azureSubscriptionNode;
    }
}
