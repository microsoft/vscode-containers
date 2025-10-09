// Many other configurations exist
import { azExtEsbuildConfigDev, azExtEsbuildConfigProd } from '@microsoft/vscode-azext-eng/esbuild';
import * as esbuild from 'esbuild';
import * as process from 'process';

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
    process.on('SIGTERM', () => ctx.dispose());
} else {
    await esbuild.build(config);
}
