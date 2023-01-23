/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { IContainersClient } from './ContainerClient';
import { IContainerOrchestratorClient } from './ContainerOrchestratorClient';

/**
 * This interface is implemented by the Docker extension. To access it, use {@link getDockerExtensionExport}
 * below. Alternatively, use the
 * [extension API](https://code.visualstudio.com/api/references/vscode-api#extensions), with
 * the ID of the Docker extension (`ms-azuretools.vscode-docker`).
 */
export interface DockerExtensionExport {
    /**
     * Registers a container runtime client with the Docker extension
     * @param client The client implementing the {@link IContainersClient} interface
     * @returns A {@link Disposable} that, when disposed, will undo the client registration
     */
    registerContainerRuntimeClient(client: IContainersClient): vscode.Disposable;

    /**
     * Registers a container orchestrator client with the Docker extension
     * @param client The client implementing the {@link IContainerOrchestratorClient} interface
     * @returns A {@link Disposable} that, when disposed, will undo the client registration
     */
    registerContainerOrchestratorClient(client: IContainerOrchestratorClient): vscode.Disposable;
}

/**
 * Gets the Docker extension's exports, activating it if necessary.
 * @returns The {@link DockerExtensionExport} export for the Docker extension
 * @throws An error if the Docker extension is not installed or not enabled
 */
export async function getDockerExtensionExport(): Promise<DockerExtensionExport> {
    const dockerExtensionId = 'ms-azuretools.vscode-docker';
    const dockerExtension = vscode.extensions.getExtension<DockerExtensionExport>(dockerExtensionId);

    if (!dockerExtension) {
        throw new Error(`The extension '${dockerExtensionId}' is not installed or not enabled.`);
    }

    if (!dockerExtension.isActive) {
        await dockerExtension.activate();
    }

    return dockerExtension.exports;
}
