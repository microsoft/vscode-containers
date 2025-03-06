/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as path from 'path';

export function wslifyPath(windowsPath: string): string {
    // If it's already a Linuxy path, don't do anything to it
    if (path.posix.isAbsolute(windowsPath)) {
        return windowsPath;
    }

    return windowsPath
        .replace(/\\/g, '/')
        // eslint-disable-next-line @typescript-eslint/naming-convention
        .replace(/^([A-Za-z]):/, (_, drive) => `/mnt/${drive.toLowerCase()}`);
}
