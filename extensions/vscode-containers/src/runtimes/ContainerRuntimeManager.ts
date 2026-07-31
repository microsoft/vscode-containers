/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DockerClient, IContainersClient, WslcClient } from '@microsoft/vscode-container-client';
import * as vscode from 'vscode';
import { isWindows } from '../utils/osUtils';
import { ContextManager, IContextManager } from './ContextManager';
import { RuntimeManager } from './RuntimeManager';

export class ContainerRuntimeManager extends RuntimeManager<IContainersClient> {
    private readonly _contextManager = new ContextManager();

    public constructor() {
        super(DockerClient.ClientId, 'containerClient', 'containerCommand');
    }

    public override dispose(): void {
        this._contextManager.dispose();
        super.dispose();
    }

    public override async getClient(): Promise<IContainersClient> {
        // WSLC is only registered on Windows, so on other platforms selecting it would otherwise
        // fail with a generic "not registered" error after a timeout. Surface a clear message instead.
        if (this.getSelectedClientId() === WslcClient.ClientId && !isWindows()) {
            throw new Error(vscode.l10n.t('WSLC is only available on Windows.'));
        }

        return super.getClient();
    }

    protected override reconfigureClient(client: IContainersClient): void {
        // wslc is a specifically named binary; it deliberately ignores the shared
        // `containers.containerCommand` override (which only makes sense for the docker/podman
        // aliases) and always uses its default command name.
        if (client.id === WslcClient.ClientId) {
            client.commandName = client.defaultCommandName;
            return;
        }

        super.reconfigureClient(client);
    }

    public get contextManager(): IContextManager {
        return this._contextManager;
    }
}
