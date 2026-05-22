/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import * as path from 'path';

export function findOnPath(executable: string): string | undefined {
    const pathEnv = process.env.PATH ?? process.env.Path ?? '';
    if (!pathEnv) {
        return undefined;
    }

    const isWindows = process.platform === 'win32';
    const separator = isWindows ? ';' : ':';
    const extensions = isWindows
        ? (process.env.PATHEXT ?? '.COM;.EXE;.BAT;.CMD').split(';').filter(Boolean)
        : [''];

    for (const dir of pathEnv.split(separator)) {
        if (!dir) {
            continue;
        }

        for (const ext of extensions) {
            const candidate = path.join(dir, executable + ext);
            try {
                const stat = fs.statSync(candidate);
                if (stat.isFile()) {
                    return candidate;
                }
            } catch {
                // not found; try next
            }
        }
    }

    return undefined;
}
