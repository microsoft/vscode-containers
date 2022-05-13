/*!--------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from "vscode";
import { DockerTag } from "./DockerTag";
import { RegistryTreeItem } from "./RegistryTreeItem";

/**
 * Interface for a Docker repository
 */
export interface DockerRepository extends RegistryTreeItem {
    /**
     * Gets all the tags for this repository.
     * @param refresh If true, a refresh is being done, and caching should not be used
     * @param token Cancellation token
     */
    getTags(refresh: boolean, token: CancellationToken): Promise<DockerTag[]>;

    /**
     * Deletes a repository. This method is optional.
     * @param token Cancellation token
     */
    delete?(token: CancellationToken): Promise<void>;
}
