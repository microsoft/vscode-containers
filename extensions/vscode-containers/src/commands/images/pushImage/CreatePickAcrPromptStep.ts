/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzureWizardPromptStep, IActionContext } from '@microsoft/vscode-azext-utils';
import { CommonRegistry } from '@microsoft/vscode-docker-registries';
import { pickAcr } from '../../registries/azure/pickAcr';
import { AzureSubscriptionRegistryItem } from '../../../tree/registries/Azure/AzureRegistryDataProvider';
import { UnifiedRegistryItem } from '../../../tree/registries/UnifiedRegistryTreeDataProvider';
import { PushImageWizardContext } from './PushImageWizardContext';

export interface PickAcrWizardContext extends IActionContext {
    connectedRegistry?: UnifiedRegistryItem<CommonRegistry>;
    azureSubscriptionNode?: UnifiedRegistryItem<AzureSubscriptionRegistryItem>;
}

export class CreatePickAcrPromptStep<T extends PickAcrWizardContext = PushImageWizardContext> extends AzureWizardPromptStep<T> {
    public async prompt(wizardContext: T): Promise<void> {
        wizardContext.connectedRegistry = await pickAcr(wizardContext, wizardContext.azureSubscriptionNode);
    }

    public shouldPrompt(wizardContext: T): boolean {
        return !!wizardContext.azureSubscriptionNode;
    }
}
