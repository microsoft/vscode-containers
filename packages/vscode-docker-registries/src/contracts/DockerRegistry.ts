/*!--------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from "vscode";
import { DockerRepository } from "./DockerRepository";
import { DockerCredentials } from "./DockerCredentials";
import { RegistryTreeItem } from "./RegistryTreeItem";

/**
 * Interface for a Docker registry. A registry contains a set of repositories.
 */
export interface DockerRegistry extends RegistryTreeItem {
    /**
     * The base image path, prepended to the image name when pushing.
     */
    readonly baseImagePath: string;

    /**
     * The registry ID. Must be unique within the registry provider, and consisting only of alphanumeric characters.
     */
    readonly registryId: string;

    /**
     * Gets the repositories that are contained in this registry.
     * @param refresh If true, a refresh is being done, and caching should not be used
     * @param token Cancellation token
     */
    getRepositories(refresh: boolean, token: CancellationToken): Promise<DockerRepository[]>;

    /**
     * Gets the login credentials for this registry
     * @param token Cancellation token
     */
    getDockerLoginCredentials?(token: CancellationToken): Promise<DockerCredentials>;
}
