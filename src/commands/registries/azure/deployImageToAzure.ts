/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { Site } from '@azure/arm-appservice'; // These are only dev-time imports so don't need to be lazy
import type { IAppServiceWizardContext } from "@microsoft/vscode-azext-azureappservice"; // These are only dev-time imports so don't need to be lazy
import { AzureWizard, AzureWizardExecuteStep, AzureWizardPromptStep, IActionContext, createSubscriptionContext, nonNullProp } from "@microsoft/vscode-azext-utils";
import { CommonTag } from '@microsoft/vscode-docker-registries';
import { Uri, env, l10n, window } from "vscode";
import { ext } from "../../../extensionVariables";
import { UnifiedRegistryItem } from '../../../tree/registries/UnifiedRegistryTreeDataProvider';
import { getAzExtAppService, getAzExtAzureUtils } from '../../../utils/lazyPackages';
import { registryExperience, subscriptionExperience } from '../../../utils/registryExperience';
import { DockerAssignAcrPullRoleStep } from './DockerAssignAcrPullRoleStep';
import { DockerSiteCreateStep } from './DockerSiteCreateStep';
import { DockerWebhookCreateStep } from './DockerWebhookCreateStep';
import { WebSitesPortPromptStep } from './WebSitesPortPromptStep';

export interface IAppServiceContainerWizardContext extends IAppServiceWizardContext {
    webSitesPort?: number;
}

export async function deployImageToAzure(context: IActionContext, node?: UnifiedRegistryItem<CommonTag>): Promise<void> {
    if (!node) {
        node = await registryExperience<CommonTag>(context, { contextValueFilter: { include: 'commontag' } });
    }

    const azExtAzureUtils = await getAzExtAzureUtils();
    const vscAzureAppService = await getAzExtAppService();
    const promptSteps: AzureWizardPromptStep<IAppServiceWizardContext>[] = [];

    const subscriptionItem = await subscriptionExperience(context);
    const subscriptionContext = createSubscriptionContext(subscriptionItem.wrappedItem.subscription);
    const wizardContext: IActionContext & Partial<IAppServiceContainerWizardContext> = {
        ...context,
        ...subscriptionContext,
        newSiteOS: vscAzureAppService.WebsiteOS.linux,
        newSiteKind: vscAzureAppService.AppKind.app
    };

    promptSteps.push(new vscAzureAppService.SiteNameStep());
    promptSteps.push(new azExtAzureUtils.ResourceGroupListStep());
    vscAzureAppService.CustomLocationListStep.addStep(wizardContext, promptSteps);
    promptSteps.push(new WebSitesPortPromptStep());
    promptSteps.push(new vscAzureAppService.AppServicePlanListStep());

    // Get site config before running the wizard so that any problems with the tag tree item are shown at the beginning of the process
    const executeSteps: AzureWizardExecuteStep<IAppServiceContainerWizardContext>[] = [
        new DockerSiteCreateStep(node),
        new DockerAssignAcrPullRoleStep(node),
        new DockerWebhookCreateStep(node),
    ];

    const title = l10n.t('Create new web app');
    const wizard = new AzureWizard(wizardContext, { title, promptSteps, executeSteps });
    await wizard.prompt();
    await wizard.execute();

    const site: Site = nonNullProp(wizardContext, 'site');
    const siteUri: string = `https://${site.defaultHostName}`;
    const createdNewWebApp: string = l10n.t('Successfully created web app "{0}": {1}', site.name, siteUri);
    ext.outputChannel.info(createdNewWebApp);

    const openSite: string = l10n.t('Open Site');
    // don't wait
    void window.showInformationMessage(createdNewWebApp, ...[openSite]).then((selection) => {
        if (selection === openSite) {
            void env.openExternal(Uri.parse(siteUri));
        }
    });
}
