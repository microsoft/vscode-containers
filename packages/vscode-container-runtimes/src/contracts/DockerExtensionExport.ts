/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from 'vscode';
import { IContainersClient } from './ContainerClient';

/**
 * This interface is implemented by the Docker extension. To access it, use the
 * [extension API](https://code.visualstudio.com/api/references/vscode-api#extensions), with
 * the ID of the Docker extension (`ms-azuretools.vscode-docker`).
 */
export interface DockerExtensionExport {
    /**
     * Registers a container runtime client with the Docker extension
     * @param client The client implementing the {@link IContainersClient} interface
     * @returns A {@link Disposable} that, when disposed, will undo the client registration
     */
    registerContainerRuntimeClient(client: IContainersClient): Disposable;
}
