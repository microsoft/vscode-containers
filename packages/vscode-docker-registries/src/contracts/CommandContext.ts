/*!--------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { RegistryTreeItem } from "./RegistryTreeItem";

/**
 * When context/palette commands are called on nodes, the command will be given arguments
 * in the form of: `CommandContext?`, `CommandContext[]?` (standard VSCode behavior)
 *
 * The first is the right-clicked node, and the second is the list of selected nodes
 * if multi-select is enabled
 */
export interface CommandContext {
    /**
     * The original `RegistryTreeItem` used to create this tree node
     */
    readonly originalRegistryTreeItem: RegistryTreeItem;
}
