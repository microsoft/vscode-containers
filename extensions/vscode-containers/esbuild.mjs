/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { autoEsbuildOrWatch, autoSelectEsbuildConfig } from '@microsoft/vscode-azext-eng/esbuild';

const configs = autoSelectEsbuildConfig();
const extensionConfig = configs.extension;

// Alias the workspace-local packages so esbuild resolves them from source
// (no prebuild step required), bypassing their published dist/ entry points.
Object.assign(extensionConfig.alias ??= {}, {
    '@microsoft/vscode-container-client': '../../packages/vscode-container-client/src/index.ts',
    '@microsoft/vscode-docker-registries': '../../packages/vscode-docker-registries/src/index.ts',
    '@microsoft/vscode-processutils': '../../packages/vscode-processutils/src/index.ts',
    '@microsoft/compose-language-service/client': '../../packages/compose-language-service/src/client/index.ts',
    '@microsoft/compose-language-service/vscode': '../../packages/compose-language-service/src/vscode/index.ts',
});

extensionConfig.entryPoints.push(
    {
        in: './node_modules/dockerfile-language-server-nodejs/lib/server.js',
        out: 'dockerfile-language-server-nodejs/lib/server',
    },
    {
        // Bundle the compose language server straight from the workspace-local source
        in: '../../packages/compose-language-service/src/server.ts',
        out: 'compose-language-service/lib/server',
    },
);

await autoEsbuildOrWatch(configs);
