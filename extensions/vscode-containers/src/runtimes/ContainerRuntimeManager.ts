/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DockerClient, IContainersClient } from '@microsoft/vscode-container-client';
import * as vscode from 'vscode';
import { ContextManager, IContextManager } from './ContextManager';
import { officialRuntimeRegistrations } from './officialRuntimeRegistrations';
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
        // A runtime that declares an `isSupported` predicate (e.g. wslc, which is Windows-only) is
        // not registered on machines where it isn't supported, so selecting it there would otherwise
        // fail with a generic "not registered" error after a timeout. Surface a clear message instead.
        const selectedClientId = this.getSelectedClientId();
        const registration = officialRuntimeRegistrations.find((r) => r.containerClient.ClientId === selectedClientId);
        if (registration?.isSupported && !registration.isSupported()) {
            const displayName = new registration.containerClient().displayName;
            throw new Error(vscode.l10n.t('The {0} container runtime is not supported on this platform.', displayName));
        }

        return super.getClient();
    }

    public get contextManager(): IContextManager {
        return this._contextManager;
    }
}
