// Many other configurations exist
import { azExtEsbuildConfigProd } from '@microsoft/vscode-azext-eng';
import { build } from 'esbuild';

/** @type {import('esbuild').BuildOptions} */
const config = {
    ...azExtEsbuildConfigProd,
    entryPoints: [
        ...azExtEsbuildConfigProd.entryPoints,
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

await build(config);
