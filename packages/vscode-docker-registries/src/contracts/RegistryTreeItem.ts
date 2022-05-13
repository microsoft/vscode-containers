/*!--------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Uri, ThemeIcon, Command } from "vscode";

/**
 * Interface for all nodes that appear in the Docker extension's explorer view for registries.
 * This is mostly-identical to `vscode.TreeItem` but intentionally does not extend it--`RegistryTreeItem` objects
 * created by the provider will not be directly used to build the tree in the VS Code UI, nor will they be passed
 * as context when commands are invoked. Instead, the properties below will be copied into a new object. Any
 * additional properties will not be copied.
 */
export interface RegistryTreeItem {
    /**
     * The label for the node
     */
    readonly label: string;

    /**
     * The context value for the node. In order to use the existing commands for registries in the Docker extension, this must contain // TODO
     */
    readonly contextValue: string;

    /**
     * The ID for the node. Optional. This is not the same as `providerId` / `registryId`.
     */
    readonly id?: string;

    /**
     * The icon for the node
     */
    readonly iconPath?: string | Uri | { light: string | Uri; dark: string | Uri } | ThemeIcon;

    /**
     * The description for the node (rendered less prominently than the label)
     */
    readonly description?: string | boolean;

    /**
     * The tooltip for the node
     */
    readonly tooltip?: string;

    /**
     * The command to run when the node is left-clicked
     */
    readonly command?: Command;
}
