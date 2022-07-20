/*!--------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { PassThrough } from 'stream';
import { Connection, DidOpenTextDocumentNotification, DidOpenTextDocumentParams, Disposable, InitializeParams, TextDocumentItem } from 'vscode-languageserver';
import { DocumentUri } from 'vscode-languageserver-textdocument';
import { createConnection } from 'vscode-languageserver/node';
import { Document } from 'yaml';
import { initEvent } from '../client/TelemetryEvent';
import { ComposeLanguageService } from '../service/ComposeLanguageService';
import { ActionContext } from '../service/utils/ActionContext';

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

    public constructor(public readonly initParams: InitializeParams = DefaultInitializeParams) {
        const up = new PassThrough();
        const down = new PassThrough();

        this.server = createConnection(up, down);
        this.client = createConnection(down, up);

        this.languageService = new ComposeLanguageService(this.server, initParams);

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
