/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { azExtEslintRecommendedTypeChecked } from '@microsoft/vscode-azext-eng/eslint'; // Other configurations exist
import { defineConfig, globalIgnores } from 'eslint/config';

export default defineConfig(
    globalIgnores([
        'src/test/clientExtension',
    ]),
    azExtEslintRecommendedTypeChecked,
);
