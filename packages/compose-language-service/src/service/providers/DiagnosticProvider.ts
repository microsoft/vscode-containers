/*!--------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Diagnostic, DiagnosticSeverity, TextDocumentChangeEvent } from 'vscode-languageserver';
import { ComposeDocument } from '../ComposeDocument';
import { ExtendedParams } from '../ExtendedParams';
import { debounce } from '../utils/debounce';
import { yamlRangeToLspRange } from '../utils/yamlRangeToLspRange';
import { ProviderBase } from './ProviderBase';

export class DiagnosticProvider extends ProviderBase<TextDocumentChangeEvent<ComposeDocument> & ExtendedParams, void, never, never> {
    public on(params: TextDocumentChangeEvent<ComposeDocument> & ExtendedParams): void {
        if (!params.clientCapabilities.textDocument?.publishDiagnostics) {
            return;
        }

        debounce(500, { uri: params.document.textDocument.uri, callId: 'diagnostics' }, () => {
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

            params.connection.sendDiagnostics({
                uri: params.document.textDocument.uri,
                diagnostics: diagnostics,
            });
        }, this);
    }
}
