/*!--------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Largely copied from https://github.com/microsoft/compose-language-service/blob/main/src/test/clientExtension/AlternateYamlLanguageServiceClientFeature.ts

import type { AlternateYamlLanguageServiceClientCapabilities } from '@microsoft/compose-language-service/lib/client/AlternateYamlLanguageServiceClientCapabilities';
import * as vscode from 'vscode';
import type { ClientCapabilities, FeatureState, StaticFeature } from 'vscode-languageclient';

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
        // If RedHat YAML's extension or Docker's extension is present, we can disable many of the compose language service features
        const redhat = vscode.extensions.getExtension('redhat.vscode-yaml') !== undefined;
        const docker = vscode.extensions.getExtension('docker.docker') !== undefined;
        if (redhat || docker) {
            return {
                syntaxValidation: redhat || docker,
                schemaValidation: redhat,
                basicCompletions: redhat || docker,
                advancedCompletions: false, // The other extensions do not have advanced completions for Compose docs
                hover: redhat || docker, // Compose spec has descriptions
                imageLinks: docker, // Docker's extension supports Docker Hub, GHCR, MAR, and Quay.io
                serviceStartupCodeLens: false, // The other extensions do not provide any code lens
                formatting: redhat || docker,
            };
        }
        return null;
    }

    public fillClientCapabilities(capabilities: ClientCapabilities): void {
        const altYamlClientCapabilities = this.createAlternateYamlLanguageServiceClientCapabilities();
        if (altYamlClientCapabilities !== null) {
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
