/*!--------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Connection, Diagnostic, DiagnosticSeverity, TextDocumentChangeEvent } from 'vscode-languageserver';
import { ComposeDocument } from '../ComposeDocument';
import { debounce } from '../utils/debounce';
import { yamlRangeToLspRange } from '../utils/yamlRangeToLspRange';

export class DiagnosticProvider {
    public static async onDidChangeContent(params: TextDocumentChangeEvent<ComposeDocument> & { connection: Connection }): Promise<void> {
        DiagnosticProvider.sendDiagnostics(params.document, params.connection);
    }

    private static sendDiagnostics(doc: ComposeDocument, connection: Connection): void {
        debounce(500, { uri: doc.textDocument.uri, callId: 'diagnostics' }, () => {
            const diagnostics: Diagnostic[] = [];

            for (const error of [...doc.yamlDocument.errors, ...doc.yamlDocument.warnings]) {
                diagnostics.push(
                    Diagnostic.create(
                        yamlRangeToLspRange(doc.textDocument, error.pos),
                        error.message,
                        error.name === 'YAMLWarning' ? DiagnosticSeverity.Warning : DiagnosticSeverity.Error,
                        error.code
                    )
                );
            }

            connection.sendDiagnostics({
                uri: doc.textDocument.uri,
                diagnostics: diagnostics,
            });
        }, this);
    }
}
