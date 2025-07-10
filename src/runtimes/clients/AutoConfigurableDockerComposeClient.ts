/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DockerComposeClient, IContainerOrchestratorClient, PodmanComposeClient } from '@microsoft/vscode-container-client';
import * as vscode from 'vscode';
import { configPrefix } from '../../constants';
import { ext } from '../../extensionVariables';
import { AsyncLazy } from '../../utils/lazy';
import { AutoConfigurableClient } from './AutoConfigurableClient';

export interface ComposeConfig {
    commandName: string;
    composeV2: boolean;
}

/**
 * IMPORTANT NOTE: This class is largely identical to {@link AutoConfigurablePodmanComposeClient}, and the two should be kept in sync.
 */
export class AutoConfigurableDockerComposeClient extends DockerComposeClient implements AutoConfigurableClient {
    private readonly composeConfigLazy = new AsyncLazy<ComposeConfig>(() => this.detectComposeConfig());

    public constructor() {
        super();
        this.reconfigure();
    }

    public reconfigure(): void {
        this.composeConfigLazy.clear();
    }

    public async slowConfigure(): Promise<void> {
        const config = await this.composeConfigLazy.getValue();
        this.commandName = config.commandName;
        this.composeV2 = config.composeV2;
    }

    private async detectComposeConfig(): Promise<ComposeConfig> {
        const config = vscode.workspace.getConfiguration(configPrefix);

        let composeCommand = config.get<string | undefined>('composeCommand');

        if (composeCommand) {
            // User has explicitly set a compose command, so we will respect it

            let isComposeV2 = false;
            if (/^docker(\s+compose\s*)?$/i.test(composeCommand)) {
                // Normalize both "docker" and "docker compose" to "docker", with `isComposeV2` true
                composeCommand = 'docker';
                isComposeV2 = true;
            }

            return {
                commandName: composeCommand,
                composeV2: isComposeV2,
            };
        } else {
            // User has not set a compose command, so we will attempt to autodetect it

            try {
                ext.outputChannel.info('Attempting to autodetect Docker Compose command...');
                await ext.runWithDefaults(
                    () => this.checkOrchestratorInstall({ composeVersion: 'v2' }),
                );

                // If successful, then assume we can use compose V2
                return {
                    commandName: 'docker',
                    composeV2: true,
                };
            } catch {
                // Do nothing
            }

            return {
                commandName: 'docker-compose',
                composeV2: false,
            };
        }
    }
}

interface ComposeV2ableOrchestratorClient extends IContainerOrchestratorClient {
    composeV2: boolean;
}

export function isComposeV2ableOrchestratorClient(maybeClient: IContainerOrchestratorClient): maybeClient is ComposeV2ableOrchestratorClient {
    return maybeClient.id === DockerComposeClient.ClientId ||
        maybeClient.id === PodmanComposeClient.ClientId;
}

interface SlowConfigurableOrchestratorClient extends IContainerOrchestratorClient {
    slowConfigure(): Promise<void>;
}

export function isSlowConfigurableOrchestratorClient(maybeClient: IContainerOrchestratorClient): maybeClient is SlowConfigurableOrchestratorClient {
    return typeof (maybeClient as SlowConfigurableOrchestratorClient).slowConfigure === 'function';
}
