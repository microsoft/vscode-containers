/*!--------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

const vscode = require('vscode');

/**
 * This class will note the features covered by an alternate YAML language service,
 * that the compose language service can disable
 */
class AlternateYamlLanguageServiceClientFeature {
    getState() {
        return {
            kind: 'static'
        };
    }

    fillClientCapabilities(capabilities) {
        // If the RedHat YAML extension is present, we can disable many of the compose language service features
        if (vscode.extensions.getExtension('redhat.vscode-yaml')) {
            const altYamlClientCapabilities = {
                syntaxValidation: true,
                schemaValidation: true,
                basicCompletions: true,
                advancedCompletions: false, // YAML extension does not have advanced completions for compose docs
                serviceStartupCodeLens: false, // YAML extension does not have service startup for compose docs
                hover: false, // YAML extension provides hover, but the compose spec lacks descriptions -- https://github.com/compose-spec/compose-spec/issues/138
                imageLinks: false, // YAML extension does not have image hyperlinks for compose docs
                formatting: true,
            };

            capabilities.experimental = {
                ...capabilities.experimental,
                alternateYamlLanguageService: altYamlClientCapabilities,
            };
        }
    }

    initialize() {
        // Noop
    }

    dispose() {
        // Noop
    }
}

module.exports = { AlternateYamlLanguageServiceClientFeature };
