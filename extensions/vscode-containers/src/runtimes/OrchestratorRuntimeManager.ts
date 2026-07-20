/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DockerComposeClient, IContainerOrchestratorClient } from '@microsoft/vscode-container-client';
import * as vscode from 'vscode';
import { configPrefix } from '../constants';
import { RuntimeManager } from './RuntimeManager';

// Matches a base command that still ends with the `compose` subcommand, whether V1-style (`docker-compose`,
// `podman-compose.exe`, or a rooted path to one) or an explicit V2 command (`docker compose`).
const composeSuffixRegex = /[-\s]+compose(\.exe)?\s*$/i;

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

            // The base command must not already include the `compose` subcommand, otherwise we'd invoke
            // e.g. `docker-compose compose`. Rather than silently rewriting the command (which breaks for
            // rooted paths and standalone binaries), show an actionable error asking the user to fix it.
            if (composeSuffixRegex.test(client.commandName)) {
                void vscode.window.showErrorMessage(vscode.l10n.t(
                    'The "{0}.{1}" setting is set to "{2}", but Compose V1 (for example "docker-compose") is no longer supported. Set it to the base command only (for example "docker" or "podman"); it will be invoked as "docker compose".',
                    configPrefix,
                    this.overrideCommandSettingName,
                    client.commandName));
            }
        }
    }
}

interface ComposeV2ableOrchestratorClient extends IContainerOrchestratorClient {
    composeV2: boolean;
}

export function isComposeV2ableOrchestratorClient(maybeClient: IContainerOrchestratorClient): maybeClient is ComposeV2ableOrchestratorClient {
    return 'composeV2' in maybeClient && typeof (maybeClient as ComposeV2ableOrchestratorClient).composeV2 === 'boolean';
}
