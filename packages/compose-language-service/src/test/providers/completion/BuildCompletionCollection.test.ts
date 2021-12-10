/*!--------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CompletionRequest, InsertTextFormat, InsertTextMode, Position, ResponseError } from 'vscode-languageserver';
import { TestConnection } from '../../TestConnection';
import { ExpectedCompletionItem, requestCompletionsAndCompare, UnexpectedCompletionItem } from './requestCompletionsAndCompare';

// A subset of the completions that are provided by the BuildCompletionCollection
const defaultExpected: ExpectedCompletionItem[] = [
    {
        // Context
        label: 'context:',
        insertTextCanary: 'buildContext',
        insertTextFormat: InsertTextFormat.Snippet,
    },
    {
        // Dockerfile
        label: 'dockerfile:',
        insertTextCanary: 'dockerfile',
        insertTextFormat: InsertTextFormat.Snippet,
    },
    {
        // Args
        label: 'args:',
        insertTextCanary: 'value',
        insertTextFormat: InsertTextFormat.Snippet,
        insertTextMode: InsertTextMode.adjustIndentation,
    },
];

// Completions that are not allowed from BuildCompletionCollection
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
    {
        insertTextCanary: 'healthcheck',
    },
    {
        insertTextCanary: 'build:',
    },
];

describe('BuildCompletionCollection', () => {
    let testConnection: TestConnection;
    before('Prepare a language server for testing', async () => {
        testConnection = new TestConnection();
    });

    describe('Common scenarios', () => {
        it('Should provide completions when within the build tag', async () => {
            const testObject = `services:
  foo:
    image: redis
    build:
      `;

            const uri = testConnection.sendTextAsYamlDocument(testObject);

            await requestCompletionsAndCompare(
                testConnection,
                uri,
                Position.create(4, 6), // Indented on the line under `build`
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

        it('Should NOT provide completions if over-indented under build', async () => {
            const testObject = `services:
  foo:
    image: redis
    build:
      context: .
        `;

            const uri = testConnection.sendTextAsYamlDocument(testObject);

            await requestCompletionsAndCompare(
                testConnection,
                uri,
                Position.create(5, 8), // Indented further on the line under `context`
                [],
                defaultExpected
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
