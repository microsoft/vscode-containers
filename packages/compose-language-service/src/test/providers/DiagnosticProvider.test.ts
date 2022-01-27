/*!--------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { expect } from 'chai';
import { ClientCapabilities, Diagnostic, DocumentUri, InitializeParams, PublishDiagnosticsNotification, PublishDiagnosticsParams, Range } from 'vscode-languageserver-protocol';
import { DefaultInitializeParams, TestConnection } from '../TestConnection';

const DiagnosticClientCapabilities: ClientCapabilities = {
    textDocument: {
        publishDiagnostics: {}, // Just the object is checked to be truthy at this time, none of the subfeatures are needed
        moniker: {}, // For some reason this is a mandatory parameter
    },
};

interface ExpectedDiagnostic {
    range: Range;
    contentCanary: string;
}

const DiagnosticDelay = 10;

describe('DiagnosticProvider', () => {
    let testConnection: TestConnection;
    let noDiagnosticsTestConnection: TestConnection;
    before('Prepare a language server for testing (with added diagnostic capability)', async () => {
        const initParams: InitializeParams = {
            ...DefaultInitializeParams,
            ...{ initializationOptions: { diagnosticDelay: DiagnosticDelay } },
            ...{ capabilities: DiagnosticClientCapabilities },
        };

        testConnection = new TestConnection(initParams);

        const noDiagnosticsInitParams: InitializeParams = {
            ...DefaultInitializeParams,
            ...{ initializationOptions: { diagnosticDelay: DiagnosticDelay } },
        };

        noDiagnosticsTestConnection = new TestConnection(noDiagnosticsInitParams);
    });

    describe('Common scenarios', () => {
        it('Should provide diagnostics for malformed yaml', async () => {
            const malformedTestObject = `version: '123'

services:
  foo:
      build: .
    image: redis

  [bar : foo
`;

            const expected: ExpectedDiagnostic[] = [
                {
                    range: Range.create(5, 0, 5, 1), // The YAML library's ranges aren't super helpful, but the start position is at least accurate
                    contentCanary: 'start at the same column',
                },
                {
                    range: Range.create(7, 2, 7, 3),
                    contentCanary: 'on a single line',
                },
                {
                    range: Range.create(7, 2, 8, 0),
                    contentCanary: 'followed by map values',
                },
                {
                    range: Range.create(8, 0, 8, 0),
                    contentCanary: 'and end with a ]',
                },
            ];

            await awaitDiagnosticsAndCompare(testConnection, malformedTestObject, expected);
        });

        it('Should provide nothing for valid compose documents', async () => {
            const validTestObject = {
                version: '123',
                services: {
                    foo: {
                        image: 'redis',
                        build: '.',
                        ports: ['1234', '5678:9012'],
                    },
                    bar: {
                        image: 'alpine',
                        volumes: ['foo:/bar:rw'],
                    },
                },
            };

            const expected = undefined;

            await awaitDiagnosticsAndCompare(testConnection, validTestObject, expected);
        });

        xit('TODO: Should provide schema validation diagnostics for malformed compose documents');
    });

    describe('Error scenarios', () => {
        it('Should NOT send diagnostics if the client doesn\'t support it', () => {
            const malformedTestObject = `[bar : foo`;

            return awaitDiagnosticsAndCompare(noDiagnosticsTestConnection, malformedTestObject, []).should.eventually.be.rejectedWith('timed out');
        });
    });

    after('Cleanup', () => {
        testConnection.dispose();
        noDiagnosticsTestConnection.dispose();
    });
});

async function awaitDiagnosticsAndCompare(testConnection: TestConnection, testObject: string | unknown, expected: ExpectedDiagnostic[] | undefined): Promise<void> {
    let timeout: NodeJS.Timeout | undefined = undefined;

    try {
        // Need to connect the listener *before* sending the document, to ensure no timing issues, i.e. with the response being sent before the listener is ready
        const listenerPromise = new Promise<PublishDiagnosticsParams>((resolve) => {
            testConnection.client.onNotification(PublishDiagnosticsNotification.type, (diagnosticParams) => {
                resolve(diagnosticParams);
            });
        });

        // Now that the listener is connected, send the document
        let uri: DocumentUri;
        if (typeof (testObject) === 'string') {
            uri = testConnection.sendTextAsYamlDocument(testObject);
        } else {
            uri = testConnection.sendObjectAsYamlDocument(testObject);
        }

        // A promise that will reject if it times out (if the diagnostics never get sent)
        const failurePromise = new Promise<never>((resolve, reject) => {
            timeout = setTimeout(() => reject('timed out awaiting diagnostic response'), DiagnosticDelay * 10); // This carries some risk of test fragility but we have to draw a line somewhere (*sigh* halting problem)
        });

        // Now await the listener's completion promise to get the result
        const result = await Promise.race<PublishDiagnosticsParams>([listenerPromise, failurePromise]);

        expect(result).to.be.ok;
        result.uri.should.equal(uri);

        expect(result.diagnostics).to.be.ok;
        result.diagnostics.length.should.equal((expected ?? []).length);

        if (expected?.length) {
            // Each diagnostic should have a matching range and content canary in the results
            for (const expectedDiagnostic of expected) {
                result.diagnostics.some(actualDiagnostic => diagnosticsMatch(actualDiagnostic, expectedDiagnostic)).should.be.true;
            }
        }
    } finally {
        if (timeout) {
            clearTimeout(timeout);
        }
    }
}

function diagnosticsMatch(actual: Diagnostic, expected: ExpectedDiagnostic): boolean {
    return (
        actual.message.indexOf(expected.contentCanary) >= 0 &&
        actual.range.start.line === expected.range.start.line &&
        actual.range.start.character === expected.range.start.character &&
        actual.range.end.line === expected.range.end.line &&
        actual.range.end.character === expected.range.end.character
    );
}
