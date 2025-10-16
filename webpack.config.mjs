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
    ignoreWarnings: [
        {
            // Ignore some warnings from handlebars in code that doesn't get used anyway
            module: /node_modules\/handlebars\/lib\/index\.js/,
            message: /require\.extensions/,
        },
        {
            // Ignore a warning from vscode-languageclient about umd dependencies
            module: /node_modules\/vscode-languageclient\/node_modules\/vscode-languageserver-types\/lib\/umd\/main.js/,
            message: /Critical dependency: require function/
        },
        {
            // Ignore a warning from express
            module: /node_modules\/express\/lib\/view\.js/,
            message: /Critical dependency: the request of a dependency is an expression/
        },
        ...baseConfig.ignoreWarnings,
    ],
};
