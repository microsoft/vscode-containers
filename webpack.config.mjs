/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { autoSelectWebpackConfig } from '@microsoft/vscode-azext-eng/webpack';

const baseConfig = autoSelectWebpackConfig();

/** @type {import('webpack').Configuration} */
export default {
    ...baseConfig,
    entry: {
        ...baseConfig.entry,
        './dockerfile-language-server-nodejs/lib/server': './node_modules/dockerfile-language-server-nodejs/lib/server.js',
        './compose-language-service/lib/server': './node_modules/@microsoft/compose-language-service/lib/server.js',
    },
    module: {
        rules: [
            ...baseConfig.module.rules,
            {
                // Unpack UMD module headers used in some modules since webpack doesn't handle them.
                test: /dockerfile-language-service|vscode-languageserver-types/,
                use: { loader: 'umd-compat-loader' },
            },
        ],
    },
    ignoreWarnings: [
        {
            // Ignore some warnings from handlebars in code that doesn't get used anyway
            module: /node_modules\/handlebars\/lib\/index\.js/,
            message: /require\.extensions/,
        },
        ...baseConfig.ignoreWarnings,
    ],
};
