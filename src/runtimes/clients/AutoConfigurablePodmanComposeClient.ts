/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { PodmanComposeClient } from '@microsoft/vscode-container-client';
import * as vscode from 'vscode';
import { configPrefix } from '../../constants';
import { ext } from '../../extensionVariables';
import { AsyncLazy } from '../../utils/lazy';
import { AutoConfigurableClient } from './AutoConfigurableClient';
import { ComposeConfig } from './AutoConfigurableDockerComposeClient';

/**
 * IMPORTANT NOTE: This class is largely identical to {@link AutoConfigurableDockerComposeClient}, and the two should be kept in sync.
 */
export class AutoConfigurablePodmanComposeClient extends PodmanComposeClient implements AutoConfigurableClient {
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
            if (/^podman(\s+compose\s*)?$/i.test(composeCommand)) {
                // Normalize both "podman" and "podman compose" to "podman", with `isComposeV2` true
                composeCommand = 'podman';
                isComposeV2 = true;
            }

            return {
                commandName: composeCommand,
                composeV2: isComposeV2,
            };
        } else {
            // User has not set a compose command, so we will attempt to autodetect it

            try {
                ext.outputChannel.info('Attempting to autodetect Podman Compose command...');
                await ext.runWithDefaults(
                    () => this.checkOrchestratorInstall({ composeVersion: 'v2' }),
                );

                // If successful, then assume we can use compose V2
                return {
                    commandName: 'podman',
                    composeV2: true,
                };
            } catch {
                // Do nothing
            }

            return {
                commandName: 'podman-compose',
                composeV2: false,
            };
        }
    }
}
