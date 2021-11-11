/*!--------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CompletionRequest, InsertTextFormat, Position, ResponseError } from 'vscode-languageserver';
import { TestConnection } from '../../TestConnection';
import { ExpectedCompletionItem, requestCompletionsAndCompare, UnexpectedCompletionItem } from './requestCompletionsAndCompare';

// Completions that are not allowed from VolumesCompletionCollection
const defaultUnexpected: UnexpectedCompletionItem[] = [
    {
        insertTextCanary: 'services',
    },
    {
        insertTextCanary: 'build',
    },
    {
        insertTextCanary: 'containerPort',
    },
];

describe('VolumesCompletionCollection', () => {
    let testConnection: TestConnection;
    before('Prepare a language server for testing', async () => {
        testConnection = new TestConnection();
    });

    describe('Common scenarios', () => {
        it('Should provide completions when in a volume mapping', async () => {
            const testObject = `services:
  foo:
    volumes:
      - `;

            const uri = testConnection.sendTextAsYamlDocument(testObject);

            const expected: ExpectedCompletionItem[] = [
                {
                    label: 'hostPath:containerPath:mode',
                    insertTextCanary: 'hostPath',
                    insertTextFormat: InsertTextFormat.Snippet,
                },
                {
                    label: 'volumeName:containerPath:mode',
                    insertTextCanary: 'volumeName',
                    insertTextFormat: InsertTextFormat.Snippet,
                },
            ];

            const unexpected: UnexpectedCompletionItem[] = [
                {
                    insertTextCanary: '${1:containerPath}',
                },
            ];

            await requestCompletionsAndCompare(
                testConnection,
                uri,
                Position.create(3, 7), // Immediately after the dash under `volumes:`
                expected,
                [...defaultUnexpected, ...unexpected]
            );

            await requestCompletionsAndCompare(
                testConnection,
                uri,
                Position.create(3, 8), // One space after the dash under `volumes:`
                expected,
                [...defaultUnexpected, ...unexpected]
            );
        });

        it('Should provide completions when after the host path / volume name part of a volume mapping', async () => {
            const testObject = `services:
  foo:
    volumes:
      - volumeName:
      - /host/path:`;

            const uri = testConnection.sendTextAsYamlDocument(testObject);

            const expected: ExpectedCompletionItem[] = [
                {
                    label: ':containerPath:mode',
                    insertTextCanary: 'containerPath',
                    insertTextFormat: InsertTextFormat.Snippet,
                },
            ];

            const unexpected: UnexpectedCompletionItem[] = [
                {
                    insertTextCanary: '${2:containerPath}',
                },
            ];

            await requestCompletionsAndCompare(
                testConnection,
                uri,
                Position.create(3, 19), // Immediately after `volumeName:`
                expected,
                [...defaultUnexpected, ...unexpected]
            );

            await requestCompletionsAndCompare(
                testConnection,
                uri,
                Position.create(4, 19), // Immediately after `/host/path:`
                expected,
                [...defaultUnexpected, ...unexpected]
            );
        });

        it('Should provide completions when after the host path / volume name and container path parts of a volume mapping', async () => {
            const testObject = `services:
  foo:
    volumes:
      - volumeName:/container/path:
      - /host/path:/container/path:`;

            const uri = testConnection.sendTextAsYamlDocument(testObject);

            const expected: ExpectedCompletionItem[] = [
                {
                    label: ':ro',
                    insertTextCanary: 'ro',
                    insertTextFormat: InsertTextFormat.PlainText,
                },
                {
                    label: ':rw',
                    insertTextCanary: 'rw',
                    insertTextFormat: InsertTextFormat.PlainText,
                },
            ];

            const unexpected: UnexpectedCompletionItem[] = [
                {
                    insertTextCanary: '${1:containerPath}',
                },
                {
                    insertTextCanary: '${2:containerPath}',
                },
            ];

            await requestCompletionsAndCompare(
                testConnection,
                uri,
                Position.create(3, 35), // Immediately after `volumeName:/container/path:`
                expected,
                [...defaultUnexpected, ...unexpected]
            );

            await requestCompletionsAndCompare(
                testConnection,
                uri,
                Position.create(4, 35), // Immediately after `/host/path:/container/path:`
                expected,
                [...defaultUnexpected, ...unexpected]
            );
        });

        it('Should NOT provide completions at the root', async () => {
            const testObject = `version: '3.4'
`;

            const uri = testConnection.sendTextAsYamlDocument(testObject);

            const unexpected: UnexpectedCompletionItem[] = [
                {
                    insertTextCanary: 'volumeName',
                },
                {
                    insertTextCanary: 'hostPath',
                },
                {
                    insertTextCanary: 'containerPath',
                },
                {
                    insertTextCanary: 'ro',
                },
                {
                    insertTextCanary: 'rw',
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
                    insertTextCanary: 'volumeName',
                },
                {
                    insertTextCanary: 'hostPath',
                },
                {
                    insertTextCanary: 'containerPath',
                },
                {
                    insertTextCanary: 'ro',
                },
                {
                    insertTextCanary: 'rw',
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

        it('Should NOT provide completions under ports', async () => {
            const testObject = `services:
  foo:
    ports:
      - `;

            const uri = testConnection.sendTextAsYamlDocument(testObject);

            const unexpected: UnexpectedCompletionItem[] = [
                {
                    insertTextCanary: 'volumeName',
                },
                {
                    insertTextCanary: 'hostPath',
                },
                {
                    insertTextCanary: 'containerPath',
                },
                // {
                //     insertTextCanary: 'ro', // 'ro' is in 'hostPort:containerPort/protocol' so we can't use it as a canary
                // },
                {
                    insertTextCanary: 'rw',
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
