/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzureWizardPromptStep } from '@microsoft/vscode-azext-utils';
import { pickAcr } from '../../registries/azure/pickAcr';
import { PushImageWizardContext } from './PushImageWizardContext';

export class CreatePickAcrPromptStep extends AzureWizardPromptStep<PushImageWizardContext> {
    public async prompt(wizardContext: PushImageWizardContext): Promise<void> {
        wizardContext.connectedRegistry = await pickAcr(wizardContext, wizardContext.azureSubscriptionNode);
    }

    public shouldPrompt(wizardContext: PushImageWizardContext): boolean {
        return !!wizardContext.azureSubscriptionNode;
    }
}
