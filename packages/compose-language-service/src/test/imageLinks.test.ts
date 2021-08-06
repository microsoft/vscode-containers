/*!--------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { expect } from 'chai';
import * as fs from 'fs';
import { DidOpenTextDocumentNotification, DidOpenTextDocumentParams, DocumentLink, DocumentLinkParams, DocumentLinkRequest, TextDocumentItem } from 'vscode-languageserver';
import { TestConnection } from './TestConnection';

describe('(Unit) `image:` tag', () => {
    const testConnection = new TestConnection();

    before(async () => {
        const openParams: DidOpenTextDocumentParams = {
            textDocument: TextDocumentItem.create('file:///foo.bar', 'dockercompose', 1, fs.readFileSync('src/test/samples/docker-compose.yml', { encoding: 'utf-8' })),
        };

        testConnection.client.sendNotification(DidOpenTextDocumentNotification.type, openParams);
    });

    it('Should provide links for general images', async () => {
        const params: DocumentLinkParams = {
            textDocument: { uri: 'file:///foo.bar' }
        };

        const result = await testConnection.client.sendRequest(DocumentLinkRequest.type, params) as DocumentLink[];
        expect(result).to.be.ok;
    });
});
