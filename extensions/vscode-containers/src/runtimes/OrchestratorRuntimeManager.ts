/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DockerComposeClient, IContainerOrchestratorClient } from '@microsoft/vscode-container-client';
import { RuntimeManager } from './RuntimeManager';
import { isSlowConfigurableOrchestratorClient } from './clients/AutoConfigurableDockerComposeClient';

export class OrchestratorRuntimeManager extends RuntimeManager<IContainerOrchestratorClient> {
    public readonly onOrchestratorRuntimeClientRegistered = this.runtimeClientRegisteredEmitter.event;

    public constructor() {
        super('orchestratorClient');
    }

    public override async getClient(): Promise<IContainerOrchestratorClient> {
        const orchestratorClient = await super.getClient();

        if (isSlowConfigurableOrchestratorClient(orchestratorClient)) {
            // If it requires some slow configuration, we will perform that now
            await orchestratorClient.slowConfigure();
        }

        return orchestratorClient;
    }

    protected override getDefaultClient(): IContainerOrchestratorClient {
        return this.runtimeClients.find(isDockerComposeClient);
    }
}

function isDockerComposeClient(maybeComposeClient: IContainerOrchestratorClient): maybeComposeClient is DockerComposeClient {
    return maybeComposeClient.id === DockerComposeClient.ClientId;
}
