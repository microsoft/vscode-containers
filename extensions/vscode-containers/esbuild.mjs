/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { autoEsbuildOrWatch, autoSelectEsbuildConfig } from '@microsoft/vscode-azext-eng/esbuild';
import { fileURLToPath } from 'url';

const { extensionConfig, telemetryConfig } = autoSelectEsbuildConfig();

// Alias the workspace-local packages so esbuild resolves them from source
// (no prebuild step required), bypassing their published dist/ entry points.
extensionConfig.alias = {
    ...extensionConfig.alias,
    '@microsoft/vscode-container-client': '../../packages/vscode-container-client/src/index.ts',
    '@microsoft/vscode-docker-registries': '../../packages/vscode-docker-registries/src/index.ts',
    '@microsoft/vscode-processutils': '../../packages/vscode-processutils/src/index.ts',
    '@microsoft/compose-language-service/client': '../../packages/compose-language-service/src/client/index.ts',
    '@microsoft/compose-language-service/vscode': '../../packages/compose-language-service/src/vscode/index.ts',
};

/** @type {import('esbuild').BuildOptions} */
const finalConfig = {
    ...extensionConfig,
    // Dependencies are bundled from their ESM builds into a CJS output, where esbuild substitutes
    // `{}` for `import.meta`. Point `import.meta.url` at a real file URL so dependencies that call
    // `createRequire(import.meta.url)` (e.g. `@azure/storage-common`'s crc64) don't throw on init.
    define: {
        ...extensionConfig.define,
        'import.meta.url': '__importMetaUrl',
    },
    inject: [
        ...(extensionConfig.inject ?? []),
        fileURLToPath(new URL('./esbuild.importMetaUrlShim.mjs', import.meta.url)),
    ],
    entryPoints: [
        ...extensionConfig.entryPoints,
        {
            in: './node_modules/dockerfile-language-server-nodejs/lib/server.js',
            out: 'dockerfile-language-server-nodejs/lib/server',
        },
        {
            // Bundle the compose language server straight from the workspace-local source
            in: '../../packages/compose-language-service/src/server.ts',
            out: 'compose-language-service/lib/server',
        },
    ],
};

await autoEsbuildOrWatch({ extensionConfig: finalConfig, telemetryConfig });
