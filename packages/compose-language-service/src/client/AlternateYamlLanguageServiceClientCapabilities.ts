/*!--------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * If another YAML-generic language service is present (e.g. from the YAML extension),
 * we can disable some of the capabilities of this extension to avoid duplicate functionality.
 */
export type AlternateYamlLanguageServiceClientCapabilities = {
    // Diagnostics features
    readonly syntaxValidation: boolean,
    readonly schemaValidation: boolean,

    // LSP features
    readonly basicCompletions: boolean,
    readonly advancedCompletions: boolean,
    readonly hover: boolean,
    readonly imageLinks: boolean,
    readonly formatting: boolean,
};
