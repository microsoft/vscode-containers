/*!--------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { ClientCapabilities, StaticFeature } from 'vscode-languageclient';
import { LanguageClient } from 'vscode-languageclient/node';

import { DocumentSettings, DocumentSettingsClientCapabilities, DocumentSettingsNotificationParams, DocumentSettingsParams } from '../../../lib/client/DocumentSettings'; // Dev-time-only imports

// Duplicating these from src/client/DocumentSettings means the above imports from `DocumentSettings` can stay dev-time-only
const DocumentSettingsRequestMethodType = '$/textDocument/documentSettings';
const DocumentSettingsChangeNotificationMethodType = '$/textDocument/documentSettings/didChange';

export class DocumentSettingsClientFeature implements StaticFeature {
    private disposables: vscode.Disposable[] = [];

    public constructor(private readonly client: LanguageClient) { }

    public fillClientCapabilities(capabilities: ClientCapabilities): void {
        const documentSettings: DocumentSettingsClientCapabilities = {
            notify: true,
            request: true,
        };

        capabilities.experimental = {
            ...capabilities.experimental,
            documentSettings,
        };
    }

    public initialize(): void {
        this.disposables.push(
            this.client.onRequest(
                DocumentSettingsRequestMethodType,
                (params: DocumentSettingsParams): DocumentSettings | undefined => {
                    const textEditor = vscode.window.visibleTextEditors.find(e => e.document.uri.toString() === params.textDocument.uri);

                    if (!textEditor) {
                        return undefined;
                    }

                    return {
                        eol: textEditor.document.eol,
                        tabSize: Number(textEditor.options.tabSize),
                    };
                }
            )
        );

        this.disposables.push(
            vscode.window.onDidChangeTextEditorOptions(
                (e: vscode.TextEditorOptionsChangeEvent) => {
                    const params: DocumentSettingsNotificationParams = {
                        textDocument: { uri: e.textEditor.document.uri.toString() },
                        eol: e.textEditor.document.eol,
                        tabSize: Number(e.options.tabSize),
                    };

                    this.client.sendNotification(DocumentSettingsChangeNotificationMethodType, params);
                }
            )
        );
    }

    public dispose(): void {
        this.disposables.forEach(d => d.dispose());
    }
}
