/*!--------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { expect } from 'chai';
import { DocumentFormattingRequest, DocumentUri, FormattingOptions, ResponseError, TextEdit } from 'vscode-languageserver-protocol';
import { TestConnection } from '../TestConnection';

describe('DocumentFormattingProvider', () => {
    let testConnection: TestConnection;
    before('Populate the language server with a compose document', async () => {
        testConnection = new TestConnection();
    });

    describe('Common scenarios', () => {
        it('Should fix up bad spacing without semantically changing anything', async () => {
            const testObject = `version: '123'
services:
  foo:
    image: bar
    build:   .
    ports:
                - 1234`;

            const uri = testConnection.sendTextAsYamlDocument(testObject);

            const expected2Space = `version: '123'
services:
  foo:
    image: bar
    build: .
    ports:
      - 1234
`;

            const expected4Space = `version: '123'
services:
    foo:
        image: bar
        build: .
        ports:
            - 1234
`;
            await requestDocumentFormattingAndCompare(testConnection, uri, 2, expected2Space);
            await requestDocumentFormattingAndCompare(testConnection, uri, 4, expected4Space);
        });

        it('Should NOT insert null on empty maps', async () => {
            const testObject = `version: '123'
services:
  foo:
    image: bar
    build: .
    ports:
      - 1234

volumes:
  myvolume:\n`;

            const uri = testConnection.sendTextAsYamlDocument(testObject);

            const expected2Space = testObject; // Output will be unchanged, null must not be inserted

            await requestDocumentFormattingAndCompare(testConnection, uri, 2, expected2Space);
        });

        it('Should NOT wrap long string lines', async () => {
            const testObject = `version: '123'
services:
  foo:
    image: bar
    build: .
    ports:
      - 1234
    labels:
      - "com.microsoft.testlongstringlinesnowrapping=thequickbrownfoxjumpsoverthelazydog"
`;

            const uri = testConnection.sendTextAsYamlDocument(testObject);

            const expected2Space = testObject; // Output will be unchanged, wrapping must not occur

            await requestDocumentFormattingAndCompare(testConnection, uri, 2, expected2Space);
        });
    });

    describe('Error scenarios', () => {
        it('Should return an error for nonexistent files', () => {
            return testConnection
                .client.sendRequest(DocumentFormattingRequest.type, { textDocument: { uri: 'file:///bogus' }, options: FormattingOptions.create(2, true) })
                .should.eventually.be.rejectedWith(ResponseError);
        });

        it('Should NOT try formatting a syntactically incorrect document', async () => {
            const testFile = `version: '123'
services:
  foo:
        image: bar
    build:   .
      ports:
                - 1234`;

            const uri = testConnection.sendTextAsYamlDocument(testFile);

            const expected = undefined;

            await requestDocumentFormattingAndCompare(testConnection, uri, 2, expected);
        });
    });

    after('Cleanup', () => {
        testConnection.dispose();
    });
});

async function requestDocumentFormattingAndCompare(testConnection: TestConnection, uri: DocumentUri, tabSize: number, expected: string | undefined): Promise<void> {
    const result = await testConnection.client.sendRequest(DocumentFormattingRequest.type, { textDocument: { uri }, options: FormattingOptions.create(tabSize, true) }) as TextEdit[] | null;

    if (expected === undefined) {
        expect(result).to.not.be.ok;
    } else {
        expect(result).to.be.ok;

        /* eslint-disable @typescript-eslint/no-non-null-assertion */
        result!.length.should.equal(1); // As of today, the formatter only ever rewrites the whole document
        result![0].newText.should.equal(expected);
        /* eslint-enable @typescript-eslint/no-non-null-assertion */
    }
}
