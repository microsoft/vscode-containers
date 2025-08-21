/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { NameValuePair, Site, SiteConfig } from '@azure/arm-appservice'; // These are only dev-time imports so don't need to be lazy
import type { CustomLocation } from "@microsoft/vscode-azext-azureappservice"; // These are only dev-time imports so don't need to be lazy
import { AzureWizardExecuteStep, nonNullProp, nonNullValueAndProp } from "@microsoft/vscode-azext-utils";
import { CommonRegistry, CommonTag } from '@microsoft/vscode-docker-registries';
import { Progress, l10n } from "vscode";
import { ext } from "../../../extensionVariables";
import { AzureRegistryDataProvider, isAzureRegistry } from '../../../tree/registries/Azure/AzureRegistryDataProvider';
import { UnifiedRegistryItem } from '../../../tree/registries/UnifiedRegistryTreeDataProvider';
import { getFullImageNameFromRegistryTagItem } from '../../../tree/registries/registryTreeUtils';
import { getAzExtAppService, getAzExtAzureUtils } from '../../../utils/lazyPackages';
import { type IAppServiceContainerWizardContext } from './deployImageToAzure';

export class DockerSiteCreateStep extends AzureWizardExecuteStep<IAppServiceContainerWizardContext> {
    public priority: number = 140;

    public constructor(private readonly tagItem: UnifiedRegistryItem<CommonTag>) {
        super();
    }

    public async execute(context: IAppServiceContainerWizardContext, progress: Progress<{ message?: string; increment?: number }>): Promise<void> {
        const creatingNewApp: string = l10n.t('Creating web app "{0}"...', context.newSiteName);
        ext.outputChannel.info(creatingNewApp);
        progress.report({ message: creatingNewApp });
        const siteConfig = await this.getNewSiteConfig(context);

        const azExtAzureUtils = await getAzExtAzureUtils();
        const vscAzureAppService = await getAzExtAppService();

        const location = await azExtAzureUtils.LocationListStep.getLocation(context);
        const locationName: string = nonNullProp(location, 'name');

        const client = await vscAzureAppService.createWebSiteClient(context);
        const siteEnvelope: Site = {
            name: context.newSiteName,
            location: locationName,
            serverFarmId: nonNullValueAndProp(context.plan, 'id'),
            siteConfig: siteConfig
        };

        if (context.customLocation) {
            // deploying to Azure Arc
            siteEnvelope.kind = 'app,linux,kubernetes,container';
            this.addCustomLocationProperties(siteEnvelope, context.customLocation);
        } else {
            siteEnvelope.identity = {
                type: 'SystemAssigned'
            };
        }

        context.site = await client.webApps.beginCreateOrUpdateAndWait(nonNullValueAndProp(context.resourceGroup, 'name'), nonNullProp(context, 'newSiteName'), siteEnvelope);
    }

    private async getNewSiteConfig(context: IAppServiceContainerWizardContext): Promise<SiteConfig> {
        const registryTI: UnifiedRegistryItem<CommonRegistry> = this.tagItem.parent.parent as unknown as UnifiedRegistryItem<CommonRegistry>;

        let username: string | undefined;
        let password: string | undefined;
        let registryUrl: string | undefined;
        const appSettings: NameValuePair[] = [];

        // Scenarios:
        // ACR -> App Service, NOT Arc App Service. Use managed service identity.
        if (isAzureRegistry(registryTI.wrappedItem) && !context.customLocation) {
            appSettings.push({ name: 'DOCKER_ENABLE_CI', value: 'true' });

            // Don't need an image, username, or password--just create an empty web app to assign permissions and then configure with an image
            // `DockerAssignAcrPullRoleStep` handles it after that
            return {
                acrUseManagedIdentityCreds: true,
                appSettings
            };
        }
        // ACR -> Arc App Service. Use regular auth. Same as any V2 registry but different way of getting auth.
        else if (isAzureRegistry(registryTI.wrappedItem) && context.customLocation) {
            const cred = await (registryTI.provider as unknown as AzureRegistryDataProvider).tryGetAdminCredentials(context, registryTI.wrappedItem);
            if (!cred?.username || !cred?.passwords?.[0]?.value) {
                throw new Error(l10n.t('Azure App service deployment on Azure Arc only supports running images from Azure Container Registry with admin enabled'));
            }

            username = cred.username;
            password = cred.passwords[0].value;
            registryUrl = registryTI.wrappedItem.baseUrl.toString();
        }
        // Other registries -> App Service *OR* Arc App Service
        else {
            if (!registryTI.provider.getLoginInformation) {
                throw new Error(l10n.t('This registry does not support deploying to Azure App Service'));
            }
            const loginInformation = await registryTI.provider.getLoginInformation(registryTI.wrappedItem);

            registryUrl = (registryTI.wrappedItem as CommonRegistry).baseUrl.toString();
            username = loginInformation.username;
            password = loginInformation.secret;
        }


        if (username && password) {
            appSettings.push({ name: "DOCKER_REGISTRY_SERVER_USERNAME", value: username });
            appSettings.push({ name: "DOCKER_REGISTRY_SERVER_PASSWORD", value: password });
        }

        if (registryUrl) {
            appSettings.push({ name: 'DOCKER_REGISTRY_SERVER_URL', value: registryUrl });
        }

        if (context.webSitesPort) {
            appSettings.push({ name: "WEBSITES_PORT", value: context.webSitesPort.toString() });
        }

        const linuxFxVersion = `DOCKER|${getFullImageNameFromRegistryTagItem(this.tagItem.wrappedItem)}`;

        return {
            linuxFxVersion,
            appSettings
        };
    }

    private addCustomLocationProperties(site: Site, customLocation: CustomLocation): void {
        site.extendedLocation = { name: customLocation.id, type: 'customLocation' };
    }

    public shouldExecute(context: IAppServiceContainerWizardContext): boolean {
        return !context.site;
    }
}
