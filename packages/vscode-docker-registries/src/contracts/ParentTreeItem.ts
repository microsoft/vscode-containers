/*!--------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { RegistryTreeItem } from "./RegistryTreeItem";
import { CancellationToken } from "vscode";

/**
 * Interface for a `RegistryTreeItem` with children. Part of the `CustomDockerRegistryProvider` implementation.
 */
export interface ParentTreeItem extends RegistryTreeItem {
    /**
     * Gets the child items for this tree node
     * @param refresh If true, a refresh is being done, and caching should not be used
     * @param token Cancellation token
     */
    getChildTreeItems(refresh: boolean, token: CancellationToken): Promise<RegistryTreeItem[]>;
}
