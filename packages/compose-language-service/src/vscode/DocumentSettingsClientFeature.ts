/*!--------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Largely copied from https://github.com/microsoft/compose-language-service/blob/main/src/test/clientExtension/DocumentSettingsClientFeature.ts

import { type DocumentSettings, type DocumentSettingsClientCapabilities, DocumentSettingsNotification, type DocumentSettingsNotificationParams, type DocumentSettingsParams, DocumentSettingsRequest } from '../common/DocumentSettingsClientCapabilities';
import * as vscode from 'vscode';
import type { ClientCapabilities, FeatureState, LanguageClient, StaticFeature } from 'vscode-languageclient/node';

/**
 * This class implements functionality to allow the language server to request information about an open document (including tab size and line endings), and also
 * notify the language server if those settings change
 */
export class DocumentSettingsClientFeature implements StaticFeature, vscode.Disposable {
    private disposables: vscode.Disposable[] = [];

    public constructor(private readonly client: LanguageClient) { }

    public clear(): void {
        this.dispose();
    }

    public getState(): FeatureState {
        return {
            kind: 'static'
        };
    }

    public fillClientCapabilities(capabilities: ClientCapabilities): void {
        const docSettingsClientCapabilities: DocumentSettingsClientCapabilities = {
            notify: true,
            request: true,
        };

        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        capabilities.experimental = {
            ...capabilities.experimental,
            documentSettings: docSettingsClientCapabilities,
        };
    }

    public initialize(): void {
        this.disposables.push(
            this.client.onRequest(
                DocumentSettingsRequest.type,
                (params: DocumentSettingsParams): DocumentSettings | undefined => {
                    const textEditor = vscode.window.visibleTextEditors.find(e => e.document.uri.toString() === params.textDocument.uri);

                    if (!textEditor) {
                        return undefined;
                    }

                    return {
                        eol: textEditor.document.eol,
                        tabSize: Number(textEditor.options.tabSize),
                    } as DocumentSettings;
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

                    void this.client.sendNotification(DocumentSettingsNotification.type, params);
                }
            )
        );
    }

    public dispose(): void {
        this.disposables.forEach(d => void d.dispose());
    }
}
