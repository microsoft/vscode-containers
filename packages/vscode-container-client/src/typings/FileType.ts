/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type * as vscode from 'vscode';

/**
 * Enumeration of file types. The types `File` and `Directory` can also be
 * a symbolic links, in that case use `FileType.File | FileType.SymbolicLink` and
 * `FileType.Directory | FileType.SymbolicLink`.
 */
export const FileType = {
    /**
     * The file type is unknown.
     */
    Unknown: 0,
    /**
     * A regular file.
     */
    File: 1,
    /**
     * A directory.
     */
    Directory: 2,
    /**
     * A symbolic link to a file.
     */
    SymbolicLink: 64,
} as const satisfies typeof vscode.FileType; // The `satisfies` ensures our copy stays in sync with vscode's FileType enum

export type FileType = (typeof FileType)[keyof typeof FileType];
