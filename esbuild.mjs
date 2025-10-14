/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { autoEsbuildOrWatch, autoSelectEsbuildConfig } from '@microsoft/vscode-azext-eng/esbuild';

const baseConfig = autoSelectEsbuildConfig();

/** @type {import('esbuild').BuildOptions} */
const finalConfig = {
    ...baseConfig,
    entryPoints: [
        ...baseConfig.entryPoints,
        {
            in: './node_modules/dockerfile-language-server-nodejs/lib/server.js',
            out: 'dockerfile-language-server-nodejs/lib/server',
        },
        {
            in: './node_modules/@microsoft/compose-language-service/lib/server.js',
            out: 'compose-language-service/lib/server',
        },
    ],
};

await autoEsbuildOrWatch(finalConfig);
