/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as os from 'os';
import * as path from 'path';
import which from 'which';

const pathCache = new Map<string, string>();

/**
 * Get a safe execution path for a command. This will return the absolute path of the command
 * to run, by searching the PATH environment variable--in other words, current working directory
 * will never be searched for the command, unless the command explicitly specifies a relative path,
 * for example `./command` or `../command`.
 * @param command The command to get a safe execution path for
 * @param alternatePath An alternate PATH environment variable to use instead of the system PATH
 * @returns The safe execution path for the command
 */
export function getSafeExecPath(command: string, alternatePath?: string): string {
    if (os.platform() !== 'win32') {
        // On non-Windows platforms, `child_process.spawn()` will not look for the executable in the CWD--only in the PATH.
        // So we can just return the command as is.
        return command;
    } else if (path.parse(command).dir) {
        // If the command is an absolute path, we can return it directly.
        // Additionally, if the command explicitly specifies a relative path (i.e. relative to CWD), we'll return it directly.
        return command;
    } else {
        // For Windows, we need to resolve the command to an absolute path using `which`.
        if (!pathCache.has(command)) {
            // We'd use the async, but it's significantly slower
            const resolvedPath = which.sync(command, { all: false, nothrow: false, path: alternatePath });
            pathCache.set(command, resolvedPath);
        }

        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        return pathCache.get(command)!;
    }
}
