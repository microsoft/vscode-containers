/*!--------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { PassThrough } from 'stream';
import { Connection, DidOpenTextDocumentNotification, DidOpenTextDocumentParams, Disposable, InitializeParams, TextDocumentItem } from 'vscode-languageserver';
import { DocumentUri } from 'vscode-languageserver-textdocument';
import { createConnection } from 'vscode-languageserver/node';
import { Document } from 'yaml';
import { DocumentSettings, DocumentSettingsNotification, DocumentSettingsParams, DocumentSettingsRequest, LF } from '../client/DocumentSettings';
import { ComposeLanguageService } from '../service/ComposeLanguageService';

export const DefaultInitializeParams: InitializeParams = {
    capabilities: {},
    processId: 1,
    rootUri: null,
    workspaceFolders: null,
};

export class TestConnection implements Disposable {
    public readonly server: Connection;
    public readonly client: Connection;
    public readonly languageService: ComposeLanguageService;
    private counter = 0;
    private documentSettingsReply: DocumentSettings = { tabSize: 2, eol: LF };

    public constructor(public readonly initParams: InitializeParams = DefaultInitializeParams) {
        const up = new PassThrough();
        const down = new PassThrough();

        this.server = createConnection(up, down);
        this.client = createConnection(down, up);

        this.languageService = new ComposeLanguageService(this.server, initParams);

        this.client.onRequest(DocumentSettingsRequest.type, (params) => this.onDocumentSettingsRequest(params));

        this.server.listen();
        this.client.listen();
    }

    public dispose(): void {
        this.languageService?.dispose();
        this.server?.dispose();
        this.client?.dispose();
    }

    public sendObjectAsYamlDocument(object: unknown): DocumentUri {
        const yamlInput = new Document(object);
        return this.sendTextAsYamlDocument(yamlInput.toString());
    }

    public sendTextAsYamlDocument(text: string): DocumentUri {
        const uri = `file:///a${this.counter++}`;

        const openParams: DidOpenTextDocumentParams = {
            textDocument: TextDocumentItem.create(uri, 'dockercompose', 1, text),
        };

        this.client.sendNotification(DidOpenTextDocumentNotification.type, openParams);
        return uri;
    }

    public notifyDocumentSettingsChanged(uri: DocumentUri, settings: DocumentSettings): void {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if (!(this.initParams.capabilities.experimental as any)?.documentSettings?.notify) {
            throw new Error('documentSettings.notify is not set to true');
        }

        this.client.sendNotification(DocumentSettingsNotification.type, { textDocument: { uri }, tabSize: settings.tabSize, eol: settings.eol });
    }

    public setDocumentSettingsReply(settings: DocumentSettings): void {
        // This error will be thrown here, since the test code caller calls this method, not `onDocumentSettingsRequest`
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if (!(this.initParams.capabilities.experimental as any)?.documentSettings?.request) {
            throw new Error('documentSettings.request is not set to true');
        }

        this.documentSettingsReply = settings;
    }

    private onDocumentSettingsRequest(params: DocumentSettingsParams): DocumentSettings {
        return this.documentSettingsReply;
    }
}
