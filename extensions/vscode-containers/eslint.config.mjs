/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { azExtEslintRecommended, lazyImportRuleConfig } from '@microsoft/vscode-azext-eng/eslint'; // Other configurations exist
import { defineConfig, globalIgnores } from 'eslint/config';

export default defineConfig([
    azExtEslintRecommended,
    globalIgnores(['scripts/**']), // Node scripts outside of the TypeScript project, like esbuild.mjs
    lazyImportRuleConfig([
        '@azure/*',
        'handlebars',
        '@microsoft/vscode-azext-azure*',
        'tar',
        'vscode-languageclient*',
        '!@microsoft/vscode-azext-azureauth',
    ]),
]);
