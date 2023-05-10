/*!--------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Diagnostic, DiagnosticSeverity, TextDocumentChangeEvent } from 'vscode-languageserver';
import { ComposeDocument } from '../ComposeDocument';
import { ExtendedParams } from '../ExtendedParams';
import { getCurrentContext } from '../utils/ActionContext';
import { debounce } from '../utils/debounce';
import { yamlRangeToLspRange } from '../utils/yamlRangeToLspRange';
import { ProviderBase } from './ProviderBase';

// The default time between when typing stops and when diagnostics will be sent (milliseconds)
const DiagnosticDelay = 1000;

export class DiagnosticProvider extends ProviderBase<TextDocumentChangeEvent<ComposeDocument> & ExtendedParams, void, never, never> {
    public constructor(
        private readonly diagnosticDelay: number = DiagnosticDelay,
        private readonly syntaxValidation: boolean,
        private readonly schemaValidation: boolean
    ) {
        super();
    }

    public on(params: TextDocumentChangeEvent<ComposeDocument> & ExtendedParams): void {
        if (!this.syntaxValidation) {
            // Do nothing if syntax validation is disabled. At present schema validation is not supported, https://github.com/microsoft/compose-language-service/issues/84
            return;
        }

        const ctx = getCurrentContext();

        ctx.telemetry.suppressAll = true; // Diagnostics is async and telemetry won't really work
        ctx.telemetry.properties.isActivationEvent = 'true'; // In case we do someday enable it, let's make sure it's treated as an activation event since it is done automatically

        if (!ctx.clientCapabilities.textDocument?.publishDiagnostics) {
            return;
        }

        debounce(this.diagnosticDelay, { uri: params.document.textDocument.uri, callId: 'diagnostics' }, () => {
            const diagnostics: Diagnostic[] = [];

            for (const error of [...params.document.yamlDocument.value.errors, ...params.document.yamlDocument.value.warnings]) {
                diagnostics.push(
                    Diagnostic.create(
                        yamlRangeToLspRange(params.document.textDocument, error.pos),
                        error.message,
                        error.name === 'YAMLWarning' ? DiagnosticSeverity.Warning : DiagnosticSeverity.Error,
                        error.code,
                    )
                );
            }

            void ctx.connection.sendDiagnostics({
                uri: params.document.textDocument.uri,
                diagnostics: diagnostics,
            });
        }, this);
    }
}
