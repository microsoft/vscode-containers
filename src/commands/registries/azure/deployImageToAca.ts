/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IActionContext, nonNullProp } from '@microsoft/vscode-azext-utils';
import { parseDockerLikeImageName } from '@microsoft/vscode-container-client';
import { CommonRegistry, CommonTag, isDockerHubRegistry, LoginInformation } from '@microsoft/vscode-docker-registries';
import * as vscode from 'vscode';
import { isAzureRegistry } from '../../../tree/registries/Azure/AzureRegistryDataProvider';
import { getFullImageNameFromRegistryTagItem } from '../../../tree/registries/registryTreeUtils';
import { UnifiedRegistryItem } from '../../../tree/registries/UnifiedRegistryTreeDataProvider';
import { isExtensionInstalledAndVersionCompatible, openExtensionInstallPage } from '../../../utils/installExtension';
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
    if (!isExtensionInstalledAndVersionCompatible(acaExtensionId, minimumAcaExtensionVersion)) {
        // This will always throw a `UserCancelledError` but with the appropriate step name
        // based on user choice about installation
        await openExtensionInstallPage(context, acaExtensionId, minimumAcaExtensionVersion, 'Azure Container Apps', 'installAcaExtension');
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
            context.errorHandling.suppressReportIssue = true;
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
