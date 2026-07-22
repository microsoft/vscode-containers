/*!--------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { PassThrough } from 'stream';
import { type Connection, DidOpenTextDocumentNotification, type DidOpenTextDocumentParams, type Disposable, type InitializeParams, TextDocumentItem, type WorkspaceFolder, WorkspaceFoldersRequest } from 'vscode-languageserver';
import type { DocumentUri } from 'vscode-languageserver-textdocument';
import { createConnection } from 'vscode-languageserver/node';
import { Document } from 'yaml';
import { initEvent } from '../common/TelemetryEvent';
import { ComposeLanguageService } from '../service/ComposeLanguageService';
import type { ActionContext } from '../service/utils/ActionContext';

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

    /**
     * The workspace folders that the (mock) client will report when the server issues a
     * `workspace/workspaceFolders` request. Assign to this to simulate open workspace folders.
     */
    public workspaceFolders: WorkspaceFolder[] | null = null;
    private counter = 0;

    public constructor(public readonly initParams: InitializeParams = DefaultInitializeParams) {
        const up = new PassThrough();
        const down = new PassThrough();

        this.server = createConnection(up, down);
        this.client = createConnection(down, up);

        this.languageService = new ComposeLanguageService(this.server, initParams);

        // Respond to the server's workspace folder requests with the configured folders
        this.client.onRequest(WorkspaceFoldersRequest.type, () => this.workspaceFolders);

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

        void this.client.sendNotification(DidOpenTextDocumentNotification.type, openParams);
        return uri;
    }

    public getMockContext(): ActionContext {
        return {
            clientCapabilities: this.initParams.capabilities,
            connection: this.server,
            telemetry: initEvent('mock'),
        };
    }
}
