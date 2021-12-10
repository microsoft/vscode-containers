/*!--------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CompletionRequest, InsertTextFormat, InsertTextMode, Position, ResponseError } from 'vscode-languageserver';
import { TestConnection } from '../../TestConnection';
import { ExpectedCompletionItem, requestCompletionsAndCompare, UnexpectedCompletionItem } from './requestCompletionsAndCompare';

// A subset of the completions that are provided by the ServiceCompletionCollection
const defaultExpected: ExpectedCompletionItem[] = [
    {
        // Build long form
        label: 'build:',
        insertTextCanary: 'context',
        insertTextFormat: InsertTextFormat.Snippet,
        insertTextMode: InsertTextMode.adjustIndentation,
    },
    {
        // Build short form
        label: 'build:',
        insertTextCanary: 'path',
        insertTextFormat: InsertTextFormat.Snippet,
    },
    {
        label: 'image:',
        insertTextCanary: 'image',
        insertTextFormat: InsertTextFormat.Snippet,
    },
    {
        label: 'healthcheck:',
        insertTextCanary: 'healthcheck',
        insertTextFormat: InsertTextFormat.Snippet,
        insertTextMode: InsertTextMode.adjustIndentation,
    },
];

// Completions that are not allowed from ServiceCompletionCollection
const defaultUnexpected: UnexpectedCompletionItem[] = [
    {
        insertTextCanary: 'services',
    },
    {
        insertTextCanary: 'containerPort',
    },
    {
        insertTextCanary: 'containerPath',
    },
];

describe('ServiceCompletionCollection', () => {
    let testConnection: TestConnection;
    before('Prepare a language server for testing', async () => {
        testConnection = new TestConnection();
    });

    describe('Common scenarios', () => {
        it('Should provide completions when within a service', async () => {
            const testObject = `services:
  foo:
    image: redis
    `;

            const uri = testConnection.sendTextAsYamlDocument(testObject);

            await requestCompletionsAndCompare(
                testConnection,
                uri,
                Position.create(3, 4), // Indented on the line under `image`
                defaultExpected,
                defaultUnexpected
            );
        });

        it('Should provide completions when within a service, even with extra whitespace', async () => {
            const testObject = `services:
  foo:
    image: redis

    `;

            const uri = testConnection.sendTextAsYamlDocument(testObject);

            await requestCompletionsAndCompare(
                testConnection,
                uri,
                Position.create(4, 4), // Indented on the second line under `image`
                defaultExpected,
                defaultUnexpected
            );
        });

        it('Should NOT provide completions at the root', async () => {
            const testObject = `version: '3.4'
`;

            const uri = testConnection.sendTextAsYamlDocument(testObject);

            await requestCompletionsAndCompare(
                testConnection,
                uri,
                Position.create(1, 0), // The start of the line after `version`
                [],
                defaultExpected
            );
        });

        it('Should NOT provide completions in an empty document', async () => {
            const testObject = '';

            const uri = testConnection.sendTextAsYamlDocument(testObject);

            await requestCompletionsAndCompare(
                testConnection,
                uri,
                Position.create(0, 0), // The start of the first line
                [],
                defaultExpected
            );
        });

        it('Should NOT provide completions if over-indented under services', async () => {
            const testObject = `services:
  foo:
    image: redis
      `;

            const uri = testConnection.sendTextAsYamlDocument(testObject);

            await requestCompletionsAndCompare(
                testConnection,
                uri,
                Position.create(3, 6), // Indented further on the line under `image`
                [],
                defaultExpected
            );
        });

        it('Should NOT provide completions on an already-completed line', async () => {
            const testObject = `services:
  foo:
    image:`;

            const uri = testConnection.sendTextAsYamlDocument(testObject);

            await requestCompletionsAndCompare(
                testConnection,
                uri,
                Position.create(2, 10), // After `image:`
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
