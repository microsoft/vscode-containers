/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Reexport the stuff from the vscode-processutils package,
// so that when we run the Mocha tests we can use the things in there.
export * from '@microsoft/vscode-processutils/vscode';

/**
 * This file is used to provide vscode specific types when running mocha test cases
 */

/**
 * Enumeration of file types. The types `File` and `Directory` can also be
 * a symbolic links, in that case use `FileType.File | FileType.SymbolicLink` and
 * `FileType.Directory | FileType.SymbolicLink`.
 */
export enum FileType {
    /**
     * The file type is unknown.
     */
    Unknown = 0,
    /**
     * A regular file.
     */
    File = 1,
    /**
     * A directory.
     */
    Directory = 2,
    /**
     * A symbolic link to a file.
     */
    SymbolicLink = 64
}
