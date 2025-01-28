/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IContainerOrchestratorClient, IContainersClient } from '@microsoft/vscode-container-client';
import { DockerExtensionApi as DockerExtensionRegistryApi, RegistryDataProvider, RegistryItem } from '@microsoft/vscode-docker-registries';
import * as vscode from 'vscode';
import { ext } from './extensionVariables';

export class DockerExtensionApi implements MementoExplorerExport, DockerExtensionRegistryApi {
    readonly #extensionMementos: ExtensionMementos | undefined;

    public constructor(ctx: vscode.ExtensionContext) {
        // If the magic VSCODE_DOCKER_TEAM environment variable is set to 1, export the mementos for use by the Memento Explorer extension
        if (process.env.VSCODE_DOCKER_TEAM === '1') {
            this.#extensionMementos = {
                globalState: ctx.globalState,
                workspaceState: ctx.workspaceState,
            };
        }
    }

    public registerContainerRuntimeClient(client: IContainersClient): vscode.Disposable {
        return ext.runtimeManager.registerRuntimeClient(client);
    }

    public registerContainerOrchestratorClient(client: IContainerOrchestratorClient): vscode.Disposable {
        return ext.orchestratorManager.registerRuntimeClient(client);
    }

    public registerRegistryDataProvider<T extends RegistryItem>(id: string, registryDataProvider: RegistryDataProvider<T>): vscode.Disposable {
        const disposable = ext.registriesTree.registerProvider(registryDataProvider);
        void ext.registriesTree.refresh();
        return disposable;
    }

    public get memento(): ExtensionMementos | undefined {
        return this.#extensionMementos;
    }
}

interface MementoExplorerExport {
    readonly memento?: ExtensionMementos;
}

interface ExtensionMementos {
    readonly globalState: vscode.Memento;
    readonly workspaceState: vscode.Memento;
}
