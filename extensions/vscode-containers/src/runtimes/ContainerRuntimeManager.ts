/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DockerClient, IContainersClient } from '@microsoft/vscode-container-client';
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

    public get contextManager(): IContextManager {
        return this._contextManager;
    }
}
