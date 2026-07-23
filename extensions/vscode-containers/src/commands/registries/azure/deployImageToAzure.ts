/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { RegistryListCredentialsResult } from '@azure/arm-containerregistry';
import { createSubscriptionContext, IActionContext, nonNullProp } from '@microsoft/vscode-azext-utils';
import { parseDockerLikeImageName } from '@microsoft/vscode-container-client';
import { CommonRegistry, CommonTag, isDockerHubRegistry } from '@microsoft/vscode-docker-registries';
import * as vscode from 'vscode';
import { AzureRegistry, AzureRegistryDataProvider, isAzureRegistry } from '../../../tree/registries/Azure/AzureRegistryDataProvider';
import { getFullImageNameFromRegistryTagItem, getResourceGroupFromAzureRegistryItem } from '../../../tree/registries/registryTreeUtils';
import { UnifiedRegistryItem } from '../../../tree/registries/UnifiedRegistryTreeDataProvider';
import { isExtensionInstalledAndVersionCompatible, openExtensionInstallPage } from '../../../utils/installExtension';
import { registryExperience } from '../../../utils/registryExperience';
import { addImageTaggingTelemetry } from '../../images/tagImage';

const appServiceExtensionId = 'ms-azuretools.vscode-azureappservice';
const minimumAppServiceExtensionVersion = '0.27.0';

interface AcrRegistryPropertiesContract {
    name: string;
    id: string;
    location: string;
    resourceGroup: string;
}

// The interface of the command options passed to the Azure App Service extension's deployImageToAppService command
interface DeployImageToAppServiceOptionsContract {
    image: string;
    registryName: string;
    repositoryName: string;
    tag: string;
    username?: string;
    secret?: string;
    acrRegistry?: AcrRegistryPropertiesContract;
}

export async function deployImageToAzure(context: IActionContext, node?: UnifiedRegistryItem<CommonTag>): Promise<void> {
    // Assert installation of the App Service extension
    if (!isExtensionInstalledAndVersionCompatible(appServiceExtensionId, minimumAppServiceExtensionVersion)) {
        await openExtensionInstallPage(context, appServiceExtensionId, minimumAppServiceExtensionVersion, 'Azure App Service', 'installAppServiceExtension');
    }

    if (!node) {
        node = await registryExperience<CommonTag>(context, { contextValueFilter: { include: /commontag/i } });
    }

    let image = getFullImageNameFromRegistryTagItem(node.wrappedItem);

    addImageTaggingTelemetry(context, image, '');

    const registry: UnifiedRegistryItem<CommonRegistry> = node.parent.parent as unknown as UnifiedRegistryItem<CommonRegistry>;
    const parsedImage = parseDockerLikeImageName(image);
    const repositoryName = nonNullProp(parsedImage, 'image');
    const tag = nonNullProp(parsedImage, 'tag');

    let commandOptions: DeployImageToAppServiceOptionsContract;

    if (isAzureRegistry(registry.wrappedItem)) {
        const azureRegistry = registry.wrappedItem as AzureRegistry;

        let adminCredentials: RegistryListCredentialsResult | undefined;
        if (azureRegistry.registryProperties.adminUserEnabled) {
            const provider = registry.provider as unknown as AzureRegistryDataProvider;
            const subscriptionContext = { ...context, ...createSubscriptionContext(azureRegistry.subscription) };
            adminCredentials = await provider.tryGetAdminCredentials(azureRegistry, subscriptionContext);
        }

        commandOptions = {
            image,
            registryName: registry.wrappedItem.baseUrl.authority,
            repositoryName,
            tag,
            username: adminCredentials?.username,
            secret: adminCredentials?.passwords?.[0]?.value,
            acrRegistry: {
                ...azureRegistry.registryProperties,
                name: nonNullProp(azureRegistry.registryProperties, 'name'),
                id: nonNullProp(azureRegistry.registryProperties, 'id'),
                resourceGroup: getResourceGroupFromAzureRegistryItem(azureRegistry),
            },
        };
    } else {
        if (typeof registry.provider.getLoginInformation !== 'function') {
            context.errorHandling.suppressReportIssue = true;
            throw new Error(vscode.l10n.t('The registry "{0}" does not support Azure App Service deployments.', registry.wrappedItem.label));
        }

        const logInInfo = await registry.provider.getLoginInformation(registry.wrappedItem);

        if (!logInInfo?.username || !logInInfo?.secret) {
            throw new Error(vscode.l10n.t('No credentials found for registry "{0}".', registry.wrappedItem.label));
        }

        if (isDockerHubRegistry(registry.wrappedItem)) {
            // Ensure Docker Hub images are prefixed with 'docker.io/...'
            if (!/^docker\.io\//i.test(image)) {
                image = 'docker.io/' + image;
            }
        }

        commandOptions = {
            image,
            registryName: registry.wrappedItem.baseUrl.authority,
            repositoryName,
            tag,
            username: logInInfo.username,
            secret: logInInfo.secret,
        };
    }

    // Don't wait
    void vscode.commands.executeCommand('appService.deployImageApi', commandOptions);
}
