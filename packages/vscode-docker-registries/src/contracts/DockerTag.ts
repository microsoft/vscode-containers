/*!--------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from "vscode";
import { RegistryTreeItem } from "./RegistryTreeItem";

/**
 * Interface for a Docker tag
 */
export interface DockerTag extends RegistryTreeItem {
    /**
     * Deletes a tag. This method is optional.
     * @param token Cancellation token
     */
    delete?(token: CancellationToken): Promise<void>;
}
