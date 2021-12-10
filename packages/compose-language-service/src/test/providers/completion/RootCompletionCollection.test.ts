/*!--------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CompletionRequest, InsertTextFormat, Position, ResponseError } from 'vscode-languageserver';
import { TestConnection } from '../../TestConnection';
import { ExpectedCompletionItem, requestCompletionsAndCompare, UnexpectedCompletionItem } from './requestCompletionsAndCompare';

// A subset of the completions that are provided by the RootCompletionCollection
const defaultExpected: ExpectedCompletionItem[] = [
    {
        label: 'services:',
        insertTextCanary: 'services',
        insertTextFormat: InsertTextFormat.PlainText,
    },
    {
        label: 'volumes:',
        insertTextCanary: 'volumes',
        insertTextFormat: InsertTextFormat.PlainText,
    },
    {
        label: 'networks:',
        insertTextCanary: 'networks',
        insertTextFormat: InsertTextFormat.PlainText,
    },
];

// Completions that are not allowed from RootCompletionCollection
const defaultUnexpected: UnexpectedCompletionItem[] = [
    {
        insertTextCanary: 'build',
    },
    {
        insertTextCanary: 'containerPort',
    },
    {
        insertTextCanary: 'containerPath',
    },
];

describe('RootCompletionCollection', () => {
    let testConnection: TestConnection;
    before('Prepare a language server for testing', async () => {
        testConnection = new TestConnection();
    });

    describe('Common scenarios', () => {
        it('Should provide completions at the root', async () => {
            const testObject = `version: '3.4'
`;

            const uri = testConnection.sendTextAsYamlDocument(testObject);

            await requestCompletionsAndCompare(
                testConnection,
                uri,
                Position.create(1, 0), // The start of the line after `version`
                defaultExpected,
                defaultUnexpected
            );
        });

        it('Should provide completions in an empty document', async () => {
            const testObject = '';

            const uri = testConnection.sendTextAsYamlDocument(testObject);

            await requestCompletionsAndCompare(
                testConnection,
                uri,
                Position.create(0, 0), // The start of the first line
                defaultExpected,
                defaultUnexpected
            );
        });

        it('Should NOT provide completions if not at the root', async () => {
            const testObject = `services:
  foo:
    image: redis
    ports:
      - 1234
`;

            const uri = testConnection.sendTextAsYamlDocument(testObject);

            await requestCompletionsAndCompare(
                testConnection,
                uri,
                Position.create(0, 3), // A few characters into `services`
                undefined,
                undefined
            );

            await requestCompletionsAndCompare(
                testConnection,
                uri,
                Position.create(0, 8), // Before the : in `services:`
                undefined,
                undefined
            );

            await requestCompletionsAndCompare(
                testConnection,
                uri,
                Position.create(0, 9), // After the : in `services:`
                undefined,
                undefined
            );

            await requestCompletionsAndCompare(
                testConnection,
                uri,
                Position.create(1, 2), // At the start of `foo:`
                undefined,
                undefined
            );

            await requestCompletionsAndCompare(
                testConnection,
                uri,
                Position.create(1, 3), // In the middle of `foo:`
                undefined,
                undefined
            );

            await requestCompletionsAndCompare(
                testConnection,
                uri,
                Position.create(1, 5), // Before the : in `foo:`
                undefined,
                undefined
            );

            await requestCompletionsAndCompare(
                testConnection,
                uri,
                Position.create(1, 6), // After the : in `foo:`
                undefined,
                undefined
            );

            await requestCompletionsAndCompare(
                testConnection,
                uri,
                Position.create(4, 6), // Before the - in the first port
                undefined,
                undefined
            );

            await requestCompletionsAndCompare(
                testConnection,
                uri,
                Position.create(4, 7), // After the - in the first port
                undefined,
                undefined
            );

            await requestCompletionsAndCompare(
                testConnection,
                uri,
                Position.create(4, 9), // In the first port
                undefined,
                undefined
            );
        });

        it('Should NOT provide completions if indented on an empty line', async () => {
            const testObject = `services:
  foo:
  `;

            const uri = testConnection.sendTextAsYamlDocument(testObject);

            await requestCompletionsAndCompare(
                testConnection,
                uri,
                Position.create(2, 2), // Indented on the empty line
                undefined,
                undefined,
            );
        });

        it('Should NOT provide completions in an empty document, if not at the root', async () => {
            const testObject = `  `;

            const uri = testConnection.sendTextAsYamlDocument(testObject);

            await requestCompletionsAndCompare(
                testConnection,
                uri,
                Position.create(0, 2), // Indented on the empty line
                undefined,
                undefined,
            );
        });

        it('Should NOT provide completions on an already-completed line', async () => {
            const testObject = `services:`;

            const uri = testConnection.sendTextAsYamlDocument(testObject);

            await requestCompletionsAndCompare(
                testConnection,
                uri,
                Position.create(0, 9), // After `services:`
                undefined,
                undefined,
            );
        });
    });

    describe('Error scenarios', () => {
        it('Should return an error for nonexistent files', () => {
            return testConnection
                .client.sendRequest(CompletionRequest.type, { textDocument: { uri: 'file:///bogus' }, position: Position.create(0, 0) })
                .should.eventually.be.rejectedWith(ResponseError);
        });
    });

    after('Cleanup', () => {
        testConnection.dispose();
    });
});
