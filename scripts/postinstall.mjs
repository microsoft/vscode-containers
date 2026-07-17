/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Repo-level postinstall hook. Copies the root legal files into each publishable
 * workspace so their published/packaged artifacts include the correct legal files
 * without having to maintain per-package copies.
 *
 * The set of files differs per package: the main extension ships real code, so it
 * needs both the license and the third-party NOTICE. The Docker extension pack
 * ships no code, so it only needs the license. The library packages under
 * packages/* publish to npm and ship only their own source, so they each need
 * just the license.
 */

import * as fs from 'fs/promises';

const copies = {
    './extensions/vscode-containers': ['./LICENSE.md', './NOTICE.html'],
    './extensions/vscode-docker': ['./LICENSE.md'],
    './packages/vscode-processutils': ['./LICENSE.md'],
    './packages/vscode-container-client': ['./LICENSE.md'],
    './packages/vscode-docker-registries': ['./LICENSE.md'],
    './packages/vscode-inproc-mcp': ['./LICENSE.md'],
};

for (const [toDir, files] of Object.entries(copies)) {
    for (const fromFile of files) {
        await fs.copyFile(fromFile, `${toDir}/${fromFile}`);
    }
}
