/*!--------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

const vscode = require('vscode');
const documentSettings = require('../../../dist/cjs/client/DocumentSettings');

class DocumentSettingsClientFeature {
    constructor(client) {
        this.client = client;
        this.disposables = [];
    }

    getState() {
        return {
            kind: 'static'
        };
    }

    fillClientCapabilities(capabilities) {
        const docSettingsClientCapabilities = {
            notify: true,
            request: true,
        };

        capabilities.experimental = {
            ...capabilities.experimental,
            documentSettings: docSettingsClientCapabilities,
        };
    }

    initialize() {
        this.disposables.push(
            this.client.onRequest(
                documentSettings.DocumentSettingsRequest.method,
                (params) => {
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
                (e) => {
                    const params = {
                        textDocument: { uri: e.textEditor.document.uri.toString() },
                        eol: e.textEditor.document.eol,
                        tabSize: Number(e.options.tabSize),
                    };

                    void this.client.sendNotification(documentSettings.DocumentSettingsNotification.method, params);
                }
            )
        );
    }

    dispose() {
        this.disposables.forEach(d => { d.dispose(); });
    }
}

module.exports = { DocumentSettingsClientFeature };
