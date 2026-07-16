/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DockerComposeClient, IContainerOrchestratorClient } from '@microsoft/vscode-container-client';
import { RuntimeManager } from './RuntimeManager';

export class OrchestratorRuntimeManager extends RuntimeManager<IContainerOrchestratorClient> {
    public constructor() {
        super(DockerComposeClient.ClientId, 'orchestratorClient', 'composeCommand');
    }

    protected override reconfigureClient(client: IContainerOrchestratorClient): void {
        const commandName = this.getOverrideSettingValue() || client.defaultCommandName;

        if (isComposeV2ableOrchestratorClient(client)) {
            // TODO: impl, normalizing `docker-compose` to `docker compose` and so on
            client.composeV2 = true;
        } else {
            client.commandName = commandName;
        }
    }
}

interface ComposeV2ableOrchestratorClient extends IContainerOrchestratorClient {
    composeV2: boolean;
}

export function isComposeV2ableOrchestratorClient(maybeClient: IContainerOrchestratorClient): maybeClient is ComposeV2ableOrchestratorClient {
    return 'composeV2' in maybeClient && typeof (maybeClient as ComposeV2ableOrchestratorClient).composeV2 === 'boolean';
}
