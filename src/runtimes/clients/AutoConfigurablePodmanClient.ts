/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { PodmanClient } from '@microsoft/vscode-container-client';
import * as vscode from 'vscode';
import { configPrefix } from '../../constants';
import { ext } from '../../extensionVariables';
import { AutoConfigurableClient } from './AutoConfigurableClient';

/**
 * IMPORTANT NOTE: This class is largely identical to {@link AutoConfigurableDockerClient}, and the two should be kept in sync.
 */
export class AutoConfigurablePodmanClient extends PodmanClient implements AutoConfigurableClient {
    public constructor() {
        super();
        this.reconfigure();
    }

    public reconfigure(): void {
        const config = vscode.workspace.getConfiguration(configPrefix);
        const podmanCommand = config.get<string | undefined>('containerCommand') || 'podman';
        this.commandName = podmanCommand;

        ext.outputChannel.debug(`${configPrefix}.containerCommand: ${this.commandName}`);
    }
}
