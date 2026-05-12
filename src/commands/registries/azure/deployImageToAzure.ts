/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DialogResponses, IActionContext, nonNullProp, UserCancelledError } from '@microsoft/vscode-azext-utils';
import { parseDockerLikeImageName } from '@microsoft/vscode-container-client';
import { CommonRegistry, CommonTag, isDockerHubRegistry, LoginInformation } from '@microsoft/vscode-docker-registries';
import * as semver from 'semver';
import * as vscode from 'vscode';
import { AzureRegistry, isAzureRegistry } from '../../../tree/registries/Azure/AzureRegistryDataProvider';
import { getFullImageNameFromRegistryTagItem, getResourceGroupFromAzureRegistryItem } from '../../../tree/registries/registryTreeUtils';
import { UnifiedRegistryItem } from '../../../tree/registries/UnifiedRegistryTreeDataProvider';
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
    acrResourceName?: string;
}

export async function deployImageToAzure(context: IActionContext, node?: UnifiedRegistryItem<CommonTag>): Promise<void> {
    // Assert installation of the App Service extension
    if (!isAppServiceExtensionInstalled()) {
        await openAppServiceInstallPage(context);
    }

    if (!node) {
        node = await registryExperience<CommonTag>(context, { contextValueFilter: { include: /commontag/i } });
    }

    let image = getFullImageNameFromRegistryTagItem(node.wrappedItem);

    addImageTaggingTelemetry(context, image, '');

    const registry: UnifiedRegistryItem<CommonRegistry> = node.parent.parent as unknown as UnifiedRegistryItem<CommonRegistry>;

    let commandOptions: DeployImageToAppServiceOptionsContract;

    if (isAzureRegistry(registry.wrappedItem)) {
        // No additional work to do; App Service extension can handle ACR on its own
        const azureRegistry = registry.wrappedItem as AzureRegistry;
        commandOptions = {
            image,
            registryName: nonNullProp(parseDockerLikeImageName(image), 'registry'),
            acrResourceGroup: getResourceGroupFromAzureRegistryItem(azureRegistry),
            acrResourceId: azureRegistry.registryProperties.id,
            acrResourceName: azureRegistry.registryProperties.name,
        };
    } else {
        if (typeof registry.provider.getLoginInformation !== 'function') {
            context.errorHandling.suppressReportIssue = true;
            throw new Error(vscode.l10n.t('The registry "{0}" does not support Azure App Service deployments.', registry.wrappedItem.label));
        }

        const logInInfo: LoginInformation = await registry.provider.getLoginInformation(registry.wrappedItem);

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
            registryName: nonNullProp(parseDockerLikeImageName(image), 'registry'),
            username: logInInfo.username,
            secret: logInInfo.secret,
        };
    }

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

    if (!appServiceVersion || !minVersion) {
        return false;
    }

    return semver.gte(appServiceVersion, minVersion);
}

async function openAppServiceInstallPage(context: IActionContext): Promise<void> {
    const existingExtension = vscode.extensions.getExtension(appServiceExtensionId);
    const isUpdate = !!existingExtension;

    const message = isUpdate
        ? vscode.l10n.t(
            'The Azure App Service extension must be updated to version {0} or higher to deploy to Azure App Service. Would you like to update it now?',
            minimumAppServiceExtensionVersion
        )
        : vscode.l10n.t(
            'Version {0} or higher of the Azure App Service extension is required to deploy to Azure App Service. Would you like to install it now?',
            minimumAppServiceExtensionVersion
        );

    const action: vscode.MessageItem = {
        title: isUpdate ? vscode.l10n.t('Update') : vscode.l10n.t('Install'),
    };

    const result = await context.ui.showWarningMessage(message, { modal: true }, action, DialogResponses.cancel);

    if (result === action) {
        await vscode.commands.executeCommand('extension.open', appServiceExtensionId);
        await vscode.commands.executeCommand('workbench.extensions.installExtension', appServiceExtensionId);
    } else {
        throw new UserCancelledError('installAppServiceExtensionDeclined');
    }

    throw new UserCancelledError('installAppServiceExtensionAccepted');
}
