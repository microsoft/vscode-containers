/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IActionContext, createSubscriptionContext } from '@microsoft/vscode-azext-utils';
import { isRepository } from '@microsoft/vscode-docker-registries';
import { ext } from '../../../extensionVariables';
import { AzureRegistry, AzureRepository, AzureSubscriptionRegistryItem, isAzureRegistry, isAzureSubscriptionRegistryItem } from '../../../tree/registries/Azure/AzureRegistryDataProvider';
import { UnifiedRegistryItem } from '../../../tree/registries/UnifiedRegistryTreeDataProvider';
import { getAzExtAzureUtils } from '../../../utils/lazyPackages';
import { registryExperience } from '../../../utils/registryExperience';

export async function openInAzurePortal(context: IActionContext, node?: UnifiedRegistryItem<AzureRegistry | AzureSubscriptionRegistryItem | AzureRepository>): Promise<void> {
    if (!node) {
        node = await registryExperience<AzureRegistry>(context, {
            registryFilter: { include: [ext.azureRegistryDataProvider.label] },
            contextValueFilter: { include: [/commonregistry/i] },
        });
    }

    const azureRegistryItem = node.wrappedItem;
    const azExtAzureUtils = await getAzExtAzureUtils();
    let subscriptionContext = undefined;
    if (isAzureSubscriptionRegistryItem(azureRegistryItem)) {
        subscriptionContext = createSubscriptionContext(azureRegistryItem.subscription);
        await azExtAzureUtils.openInPortal(subscriptionContext, `/subscriptions/${subscriptionContext.subscriptionId}`);
    } else if (isAzureRegistry(azureRegistryItem)) {
        subscriptionContext = createSubscriptionContext(azureRegistryItem.parent.subscription);
        await azExtAzureUtils.openInPortal(subscriptionContext, azureRegistryItem.registryProperties.id);
    } else if (isRepository(azureRegistryItem)) {
        subscriptionContext = createSubscriptionContext(azureRegistryItem.parent.parent.subscription);
        await azExtAzureUtils.openInPortal(subscriptionContext, `${azureRegistryItem.parent.registryProperties.id}/repository`);
    }
}
