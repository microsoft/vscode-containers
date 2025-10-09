/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { azExtEslintRecommended } from '@microsoft/vscode-azext-eng/eslint'; // Other configurations exist
import { defineConfig } from 'eslint/config';

export default defineConfig([
    azExtEslintRecommended,
    {
        rules: {
            '@typescript-eslint/no-restricted-imports': [
                'error',
                {
                    patterns: [
                        {
                            group: ['@azure/*', 'handlebars', '@microsoft/vscode-azext-azureutils', '@microsoft/vscode-azext-azureappservice'],
                            message: 'Please lazily import this package within the function that uses it to reduce extension activation time.',
                            allowTypeImports: true,
                        },
                    ],
                },
            ],
        },
    },
]);
