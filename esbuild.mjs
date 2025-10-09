/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { azExtEsbuildConfigDebug, azExtEsbuildConfigDev, azExtEsbuildConfigProd } from '@microsoft/vscode-azext-eng/esbuild'; // Other configurations exist
import * as esbuild from 'esbuild';
import * as fs from 'fs/promises';

let baseConfig;
if (process.env.DEBUG_ESBUILD) {
    baseConfig = azExtEsbuildConfigDebug;
} else if (process.argv.includes('--watch')) {
    baseConfig = azExtEsbuildConfigDev;
} else {
    baseConfig = azExtEsbuildConfigProd;
}

/** @type {import('esbuild').BuildOptions} */
const config = {
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

if (process.argv.includes('--watch')) {
    const ctx = await esbuild.context(config);
    process.on('SIGINT', () => {
        console.log('Stopping esbuild watch');
        ctx.dispose();
    });
    await ctx.watch();
} else {
    const result = await esbuild.build(config);

    if (process.env.DEBUG_ESBUILD) {
        await fs.writeFile('esbuild.meta.json', JSON.stringify(result.metafile));
    }
}
