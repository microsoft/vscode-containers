/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Repo-level postinstall hook. Copies the root `LICENSE.md` and `NOTICE.html`
 * into each publishable workspace so their published/packaged artifacts include
 * the correct legal files without having to maintain per-package copies.
 */

import * as fs from 'fs/promises';

const from = [
    './LICENSE.md',
    './NOTICE.html',
];

const to = [
    './extensions/vscode-containers',
    './extensions/vscode-docker',
];

for (const fromFile of from) {
    for (const toDir of to) {
        await fs.copyFile(fromFile, `${toDir}/${fromFile}`);
    }
}
