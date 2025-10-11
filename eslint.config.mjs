/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { azExtEslintRecommended, lazyImportRuleConfig } from '@microsoft/vscode-azext-eng/eslint'; // Other configurations exist
import { defineConfig } from 'eslint/config';

export default defineConfig([
    azExtEslintRecommended,
    lazyImportRuleConfig(['@azure/*', 'handlebars', '@microsoft/vscode-azext-azureutils', '@microsoft/vscode-azext-azureappservice']),
]);
