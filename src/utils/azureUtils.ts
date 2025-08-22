/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { AuthorizationManagementClient } from '@azure/arm-authorization';
import type { ContainerRegistryManagementClient } from '@azure/arm-containerregistry';
import { IActionContext, ISubscriptionActionContext, ISubscriptionContext } from '@microsoft/vscode-azext-utils';
import { l10n } from 'vscode';
import { getArmContainerRegistry, getAzExtAzureUtils } from './lazyPackages';

function parseResourceId(id: string): RegExpMatchArray {
    const matches: RegExpMatchArray | null = id.match(/\/subscriptions\/(.*)\/resourceGroups\/(.*)\/providers\/(.*)\/(.*)/i);
    if (matches === null || matches.length < 3) {
        throw new Error(l10n.t('Invalid Azure Resource Id'));
    }
    return matches;
}

export function getResourceGroupFromId(id: string): string {
    return parseResourceId(id)[2];
}

type AzureClientContext = ISubscriptionActionContext | [IActionContext, ISubscriptionContext];

export async function createAuthorizationManagementClient(context: AzureClientContext): Promise<AuthorizationManagementClient> {
    const azExtAzureUtils = await getAzExtAzureUtils();
    return azExtAzureUtils.createAuthorizationManagementClient(context);
}

export async function createArmContainerRegistryClient(context: AzureClientContext): Promise<ContainerRegistryManagementClient> {
    const azExtAzureUtils = await getAzExtAzureUtils();
    const armContainerRegistry = await getArmContainerRegistry();
    return azExtAzureUtils.createAzureClient(context, armContainerRegistry.ContainerRegistryManagementClient);
}
