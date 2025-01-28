/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DockerClient, IContainersClient } from '@microsoft/vscode-container-client';
import { ContextManager, IContextManager } from './ContextManager';
import { RuntimeManager } from './RuntimeManager';

export class ContainerRuntimeManager extends RuntimeManager<IContainersClient> {
    private readonly _contextManager = new ContextManager();
    public readonly onContainerRuntimeClientRegistered = this.runtimeClientRegisteredEmitter.event;

    public constructor() {
        super('containerClient');
    }

    public override dispose(): void {
        this._contextManager.dispose();
        super.dispose();
    }

    public get contextManager(): IContextManager {
        return this._contextManager;
    }

    protected override getDefaultClient(): IContainersClient {
        return this.runtimeClients.find(isDockerClient);
    }
}

function isDockerClient(maybeDockerClient: IContainersClient): maybeDockerClient is DockerClient {
    return maybeDockerClient.id === DockerClient.ClientId;
}
