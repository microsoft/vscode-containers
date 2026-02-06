/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { azExtEslintRecommended, lazyImportRuleConfig } from '@microsoft/vscode-azext-eng/eslint'; // Other configurations exist
import { defineConfig } from 'eslint/config';

export default defineConfig([
    azExtEslintRecommended,
    lazyImportRuleConfig([
        '@modelcontextprotocol/*',
        '@azure/*',
        'handlebars',
        '@microsoft/vscode-azext-azure*',
        'vscode-languageclient*',
        '!@microsoft/vscode-azext-azureauth',
    ]),
]);
