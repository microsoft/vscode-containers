/*!--------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { AlternateYamlLanguageServiceClientCapabilities } from '../common/AlternateYamlLanguageServiceClientCapabilities';
import * as vscode from 'vscode';
import type { ClientCapabilities, FeatureState, StaticFeature } from 'vscode-languageclient/node';

/**
 * This class will note the features covered by an alternate YAML language service,
 * that the compose language service can disable
 */
export class AlternateYamlLanguageServiceClientFeature implements StaticFeature, vscode.Disposable {
    public clear(): void {
        this.dispose();
    }

    public getState(): FeatureState {
        return {
            kind: 'static'
        };
    }

    private createAlternateYamlLanguageServiceClientCapabilities(): AlternateYamlLanguageServiceClientCapabilities | null {
        // If Docker's extension is present, we can disable many of the compose language service features
        const docker = vscode.extensions.getExtension('docker.docker') !== undefined;
        if (docker) {
            return {
                syntaxValidation: docker,
                schemaValidation: false, // Docker DX does not provide Compose schema validation
                basicCompletions: docker,
                advancedCompletions: false, // Docker DX does not have advanced completions for Compose docs
                hover: docker, // Compose spec has descriptions
                imageLinks: false, // Keep Compose image links local so private registries aren't incorrectly linked to Docker Hub (see #179)
                serviceStartupCodeLens: false, // Docker DX does not provide any code lens
                formatting: false, // Docker DX does support formatting, but we enable it regardless so that an explicitly-chosen formatter always works
            };
        }
        return null;
    }

    public fillClientCapabilities(capabilities: ClientCapabilities): void {
        const altYamlClientCapabilities = this.createAlternateYamlLanguageServiceClientCapabilities();
        if (altYamlClientCapabilities !== null) {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
            capabilities.experimental = {
                ...capabilities.experimental,
                alternateYamlLanguageService: altYamlClientCapabilities,
            };
        }
    }

    public initialize(): void {
        // Noop
    }

    public dispose(): void {
        // Noop
    }
}
