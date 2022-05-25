/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { BasicDockerRegistryProvider, CustomDockerRegistryProvider } from "./DockerRegistryProvider";
import { Disposable } from "vscode";

/**
 * Interface implemented by the Docker extension.
 * @example const dockerExtension = vscode.extensions.getExtension<DockerExtension>('ms-azuretools.vscode-docker').exports;
 */
export interface DockerExtension {
    /**
     * Registers a registry provider with the Docker extension
     * @param provider The provider to register with the extension
     * @returns A disposable that, when disposed, will un-register the provider
     */
    registerDockerRegistryProvider(provider: BasicDockerRegistryProvider | CustomDockerRegistryProvider): Disposable;
}
