/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DialogResponses, IActionContext, nonNullProp, UserCancelledError } from '@microsoft/vscode-azext-utils';
import { parseDockerLikeImageName } from '@microsoft/vscode-container-client';
import { CommonRegistry, CommonTag, isDockerHubRegistry, LoginInformation } from '@microsoft/vscode-docker-registries';
import * as semver from 'semver';
import * as vscode from 'vscode';
import { isAzureRegistry } from '../../../tree/registries/Azure/AzureRegistryDataProvider';
import { getFullImageNameFromRegistryTagItem } from '../../../tree/registries/registryTreeUtils';
import { UnifiedRegistryItem } from '../../../tree/registries/UnifiedRegistryTreeDataProvider';
import { registryExperience } from '../../../utils/registryExperience';
import { addImageTaggingTelemetry } from '../../images/tagImage';

const acaExtensionId = 'ms-azuretools.vscode-azurecontainerapps';
const minimumAcaExtensionVersion = '0.4.0';

// The interface of the command options passed to the Azure Container Apps extension's deployImageToAca command
interface DeployImageToAcaOptionsContract {
    image: string;
    registryName: string;
    username?: string;
    secret?: string;
}

export async function deployImageToAca(context: IActionContext, node?: UnifiedRegistryItem<CommonTag>): Promise<void> {
    // Assert installation of the ACA extension
    if (!isAcaExtensionInstalled()) {
        // This will always throw a `UserCancelledError` but with the appropriate step name
        // based on user choice about installation
        await openAcaInstallPage(context);
    }

    if (!node) {
        node = await registryExperience<CommonTag>(context, { contextValueFilter: { include: /commontag/i } });
    }

    let image = getFullImageNameFromRegistryTagItem(node.wrappedItem);

    addImageTaggingTelemetry(context, image, '');

    const registry: UnifiedRegistryItem<CommonRegistry> = node.parent.parent as unknown as UnifiedRegistryItem<CommonRegistry>;

    let commandOptions: DeployImageToAcaOptionsContract;

    if (isAzureRegistry(registry.wrappedItem)) {
        // No additional work to do; ACA can handle this on its own
        commandOptions = {
            image,
            registryName: nonNullProp(parseDockerLikeImageName(image), 'registry'),
        };
    } else {
        if (typeof registry.provider.getLoginInformation !== 'function') {
            throw new Error(vscode.l10n.t('The registry "{0}" does not support Azure Container Apps deployments.', registry.wrappedItem.label));
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
    void vscode.commands.executeCommand('containerApps.deployImageApi', commandOptions);
}

function isAcaExtensionInstalled(): boolean {
    const acaExtension = vscode.extensions.getExtension(acaExtensionId);

    if (!acaExtension?.packageJSON?.version) {
        // If the ACA extension is not present, or the package JSON didn't come through, or the version is not present, then it's not installed
        return false;
    }

    const acaVersion = semver.parse(acaExtension.packageJSON.version) ?? semver.coerce(acaExtension.packageJSON.version);
    const minVersion = semver.parse(minimumAcaExtensionVersion) ?? semver.coerce(minimumAcaExtensionVersion);

    if (!acaVersion || !minVersion) {
        return false;
    }

    return semver.gte(acaVersion, minVersion);
}

async function openAcaInstallPage(context: IActionContext): Promise<void> {
    const existingExtension = vscode.extensions.getExtension(acaExtensionId);
    const isUpdate = !!existingExtension;

    const message = isUpdate
        ? vscode.l10n.t(
            'The Azure Container Apps extension must be updated to version {0} or higher to deploy to Azure Container Apps. Would you like to update it now?',
            minimumAcaExtensionVersion
        )
        : vscode.l10n.t(
            'Version {0} or higher of the Azure Container Apps extension is required to deploy to Azure Container Apps. Would you like to install it now?',
            minimumAcaExtensionVersion
        );

    const action: vscode.MessageItem = {
        title: isUpdate ? vscode.l10n.t('Update') : vscode.l10n.t('Install'),
    };

    const result = await context.ui.showWarningMessage(message, { modal: true }, action, DialogResponses.cancel);

    if (result === action) {
        await vscode.commands.executeCommand('extension.open', acaExtensionId);
        await vscode.commands.executeCommand('workbench.extensions.installExtension', acaExtensionId);
    } else {
        throw new UserCancelledError('installAcaExtensionDeclined');
    }

    throw new UserCancelledError('installAcaExtensionAccepted');
}
