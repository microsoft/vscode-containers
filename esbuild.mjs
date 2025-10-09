/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { azExtEsbuildConfigDev, azExtEsbuildConfigProd } from '@microsoft/vscode-azext-eng/esbuild'; // Other configurations exist
import * as esbuild from 'esbuild';

const isWatch = process.argv.includes('--watch');
const baseConfig = isWatch ? azExtEsbuildConfigDev : azExtEsbuildConfigProd;

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

if (isWatch) {
    const ctx = await esbuild.context(config);
    process.on('SIGINT', () => {
        console.log('Stopping esbuild watch');
        ctx.dispose();
    });
    await ctx.watch();
} else {
    await esbuild.build(config);
}
