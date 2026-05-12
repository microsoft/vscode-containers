/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IActionContext, nonNullProp, UserCancelledError } from '@microsoft/vscode-azext-utils';
import { parseDockerLikeImageName } from '@microsoft/vscode-container-client';
import { CommonRegistry, CommonTag, isDockerHubRegistry, LoginInformation } from '@microsoft/vscode-docker-registries';
import * as semver from 'semver';
import * as vscode from 'vscode';
import { AzureRegistry, isAzureRegistry } from '../../../tree/registries/Azure/AzureRegistryDataProvider';
import { getFullImageNameFromRegistryTagItem, getResourceGroupFromAzureRegistryItem } from '../../../tree/registries/registryTreeUtils';
import { UnifiedRegistryItem } from '../../../tree/registries/UnifiedRegistryTreeDataProvider';
import { installExtension } from '../../../utils/installExtension';
import { registryExperience } from '../../../utils/registryExperience';
import { addImageTaggingTelemetry } from '../../images/tagImage';

const appServiceExtensionId = 'ms-azuretools.vscode-azureappservice';
const minimumAppServiceExtensionVersion = '0.27.0';

// The interface of the command options passed to the Azure App Service extension's deployImageToAppService command
interface DeployImageToAppServiceOptionsContract {
    image: string;
    registryName: string;
    username?: string;
    secret?: string;
    acrResourceGroup?: string;
    acrResourceId?: string;
}

export async function deployImageToAzure(context: IActionContext, node?: UnifiedRegistryItem<CommonTag>): Promise<void> {
    // Assert installation of the App Service extension
    if (!isAppServiceExtensionInstalled()) {
        await openAppServiceInstallPage(context);
    }

    if (!node) {
        node = await registryExperience<CommonTag>(context, { contextValueFilter: { include: /commontag/i } });
    }

    const commandOptions: Partial<DeployImageToAppServiceOptionsContract> = {
        image: getFullImageNameFromRegistryTagItem(node.wrappedItem),
    };

    addImageTaggingTelemetry(context, commandOptions.image, '');

    const registry: UnifiedRegistryItem<CommonRegistry> = node.parent.parent as unknown as UnifiedRegistryItem<CommonRegistry>;

    if (isAzureRegistry(registry.wrappedItem)) {
        // No additional work to do; App Service extension can handle ACR on its own
        const azureRegistry = registry.wrappedItem as AzureRegistry;
        commandOptions.acrResourceGroup = getResourceGroupFromAzureRegistryItem(azureRegistry);
        commandOptions.acrResourceId = azureRegistry.registryProperties.id;
    } else {
        const logInInfo: LoginInformation = await registry.provider.getLoginInformation(registry.wrappedItem);

        if (!logInInfo?.username || !logInInfo?.secret) {
            throw new Error(vscode.l10n.t('No credentials found for registry "{0}".', registry.wrappedItem.label));
        }

        if (isDockerHubRegistry(registry.wrappedItem)) {
            // Ensure Docker Hub images are prefixed with 'docker.io/...'
            if (!/^docker\.io\//i.test(commandOptions.image)) {
                commandOptions.image = 'docker.io/' + commandOptions.image;
            }
        }

        commandOptions.username = logInInfo.username;
        commandOptions.secret = logInInfo.secret;
    }

    commandOptions.registryName = nonNullProp(parseDockerLikeImageName(commandOptions.image), 'registry');

    // Don't wait
    void vscode.commands.executeCommand('appService.deployImageApi', commandOptions);
}

function isAppServiceExtensionInstalled(): boolean {
    const appServiceExtension = vscode.extensions.getExtension(appServiceExtensionId);

    if (!appServiceExtension?.packageJSON?.version) {
        return false;
    }

    const appServiceVersion = semver.coerce(appServiceExtension.packageJSON.version);
    const minVersion = semver.coerce(minimumAppServiceExtensionVersion);

    return semver.gte(appServiceVersion, minVersion);
}

async function openAppServiceInstallPage(context: IActionContext): Promise<void> {
    const message = vscode.l10n.t(
        'Version {0} or higher of the Azure App Service extension is required to deploy to Azure App Service. Would you like to install it now?',
        minimumAppServiceExtensionVersion
    );

    await installExtension(context, appServiceExtensionId, message);

    throw new UserCancelledError('installAppServiceExtensionAccepted');
}
