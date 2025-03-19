/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { ContainerRegistryManagementClient } from '@azure/arm-containerregistry'; // These are only dev-time imports so don't need to be lazy
import { AzureNameStep } from '@microsoft/vscode-azext-utils';
import { l10n } from 'vscode';
import { getArmContainerRegistry, getAzExtAzureUtils } from '../../../../utils/lazyPackages';
import { IAzureRegistryWizardContext } from './IAzureRegistryWizardContext';

export class AzureRegistryNameStep extends AzureNameStep<IAzureRegistryWizardContext> {
    protected async isRelatedNameAvailable(context: IAzureRegistryWizardContext, name: string): Promise<boolean> {
        const azExtAzureUtils = await getAzExtAzureUtils();
        return await azExtAzureUtils.ResourceGroupListStep.isNameAvailable(context, name);
    }

    public async prompt(context: IAzureRegistryWizardContext): Promise<void> {
        const azExtAzureUtils = await getAzExtAzureUtils();
        const armContainerRegistry = await getArmContainerRegistry();
        const client = azExtAzureUtils.createAzureClient(context, armContainerRegistry.ContainerRegistryManagementClient);
        context.newRegistryName = (await context.ui.showInputBox({
            placeHolder: l10n.t('Registry name'),
            prompt: l10n.t('Provide a registry name'),
            validateInput: async (name: string) => validateRegistryName(name, client)
        })).trim();

        context.relatedNameTask = this.generateRelatedName(context, context.newRegistryName, azExtAzureUtils.resourceGroupNamingRules);
    }

    public shouldPrompt(context: IAzureRegistryWizardContext): boolean {
        return !context.newRegistryName;
    }
}

async function validateRegistryName(name: string, client: ContainerRegistryManagementClient): Promise<string | undefined> {
    name = name ? name.trim() : '';

    const min = 5;
    const max = 50;
    if (name.length < min || name.length > max) {
        return l10n.t('The name must be between {0} and {1} characters.', min, max);
    } else if (name.match(/[^a-z0-9]/i)) {
        return l10n.t('The name can only contain alphanumeric characters.');
    } else {
        const nameStatus = await client.registries.checkNameAvailability({ name, type: 'Microsoft.ContainerRegistry/registries' });
        return nameStatus.message;
    }
}
