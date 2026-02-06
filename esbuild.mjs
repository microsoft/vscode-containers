/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { autoEsbuildOrWatch, autoSelectEsbuildConfig } from '@microsoft/vscode-azext-eng/esbuild';

const { extensionConfig, telemetryConfig } = autoSelectEsbuildConfig(true);

/** @type {import('esbuild').BuildOptions} */
const finalConfig = {
    ...extensionConfig,
    entryPoints: [
        ...extensionConfig.entryPoints,
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
finalConfig.minify = false; // TODO: remove

await autoEsbuildOrWatch({ extensionConfig: finalConfig, telemetryConfig });
