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
        // Sets `commandName` to the override setting value or the client's default
        super.reconfigureClient(client);

        if (isComposeV2ableOrchestratorClient(client)) {
            // Compose V1 (`docker-compose`) is no longer supported, so these clients always run in V2 mode,
            // where `compose` is appended as the first argument to the base command (e.g. `docker compose`).
            client.composeV2 = true;

            // Normalize a V1-style (`docker-compose`) or explicit V2 (`docker compose`) override down to the
            // base command, since composeV2 appends `compose` itself and we'd otherwise get `docker-compose compose`.
            client.commandName = client.commandName.replace(/[-\s]+compose\s*$/i, '');
        }
    }
}

interface ComposeV2ableOrchestratorClient extends IContainerOrchestratorClient {
    composeV2: boolean;
}

export function isComposeV2ableOrchestratorClient(maybeClient: IContainerOrchestratorClient): maybeClient is ComposeV2ableOrchestratorClient {
    return 'composeV2' in maybeClient && typeof (maybeClient as ComposeV2ableOrchestratorClient).composeV2 === 'boolean';
}
