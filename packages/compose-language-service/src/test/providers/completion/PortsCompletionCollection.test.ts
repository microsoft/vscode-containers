/*!--------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CompletionRequest, InsertTextFormat, Position, ResponseError } from 'vscode-languageserver';
import { TestConnection } from '../../TestConnection';
import { ExpectedCompletionItem, requestCompletionsAndCompare, UnexpectedCompletionItem } from './requestCompletionsAndCompare';

// Completions that are not allowed from PortsCompletionCollection
const defaultUnexpected: UnexpectedCompletionItem[] = [
    {
        insertTextCanary: 'services',
    },
    {
        insertTextCanary: 'build',
    },
    {
        insertTextCanary: 'containerPath',
    },
];

describe('PortsCompletionCollection', () => {
    let testConnection: TestConnection;
    before('Prepare a language server for testing', async () => {
        testConnection = new TestConnection();
    });

    describe('Common scenarios', () => {
        it('Should provide completions when in a port mapping', async () => {
            const testObject = `services:
  foo:
    ports:
      - `;

            const uri = testConnection.sendTextAsYamlDocument(testObject);

            const expected: ExpectedCompletionItem[] = [
                {
                    label: 'containerPort',
                    insertTextCanary: '80',
                    insertTextFormat: InsertTextFormat.Snippet,
                },
                {
                    label: 'hostPort:containerPort',
                    insertTextCanary: '8080',
                    insertTextFormat: InsertTextFormat.Snippet,
                },
                {
                    label: 'hostPort:containerPort/protocol',
                    insertTextCanary: 'tcp,udp',
                    insertTextFormat: InsertTextFormat.Snippet,
                },
                {
                    label: 'hostRange:containerRange',
                    insertTextCanary: '8081',
                    insertTextFormat: InsertTextFormat.Snippet,
                },
                {
                    label: '(Long form port specification)',
                    insertTextCanary: 'published',
                    insertTextFormat: InsertTextFormat.Snippet,
                },
            ];

            await requestCompletionsAndCompare(
                testConnection,
                uri,
                Position.create(3, 7), // Immediately after the dash under `ports:`
                expected,
                defaultUnexpected
            );

            await requestCompletionsAndCompare(
                testConnection,
                uri,
                Position.create(3, 8), // One space after the dash under `ports:`
                expected,
                defaultUnexpected
            );
        });

        it('Should NOT provide completions at the root', async () => {
            const testObject = `version: '3.4'
`;

            const uri = testConnection.sendTextAsYamlDocument(testObject);

            const unexpected: UnexpectedCompletionItem[] = [
                {
                    insertTextCanary: 'containerPort',
                },
                {
                    insertTextCanary: 'containerRange',
                },
                {
                    insertTextCanary: 'published',
                },
            ];

            await requestCompletionsAndCompare(
                testConnection,
                uri,
                Position.create(1, 0), // The start of the line after `version`
                [],
                unexpected
            );
        });

        it('Should NOT provide completions in an empty document', async () => {
            const testObject = ``;

            const uri = testConnection.sendTextAsYamlDocument(testObject);

            const unexpected: UnexpectedCompletionItem[] = [
                {
                    insertTextCanary: 'containerPort',
                },
                {
                    insertTextCanary: 'containerRange',
                },
                {
                    insertTextCanary: 'published',
                },
            ];

            await requestCompletionsAndCompare(
                testConnection,
                uri,
                Position.create(0, 0), // The start of the first line
                [],
                unexpected
            );
        });

        it('Should NOT provide completions under volumes', async () => {
            const testObject = `services:
  foo:
    volumes:
      - `;

            const uri = testConnection.sendTextAsYamlDocument(testObject);

            const unexpected: UnexpectedCompletionItem[] = [
                {
                    insertTextCanary: 'containerPort',
                },
                {
                    insertTextCanary: 'containerRange',
                },
                {
                    insertTextCanary: 'published',
                },
            ];

            await requestCompletionsAndCompare(
                testConnection,
                uri,
                Position.create(3, 7), // Immediately after the dash under `ports:`
                [],
                unexpected
            );

            await requestCompletionsAndCompare(
                testConnection,
                uri,
                Position.create(3, 8), // One space after the dash under `ports:`
                [],
                unexpected
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
