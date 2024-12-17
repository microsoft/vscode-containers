/*!--------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { expect } from 'chai';
import { CodeLensRequest, CodeLens, DocumentUri, Range, ResponseError } from 'vscode-languageserver';
import { TestConnection } from '../TestConnection';

interface ExpectedServiceStartupCodeLens {
    range: Range;
    command: {
        command: string;
    }
}

describe('ServiceStartupCodeLensProvider', () => {
    let testConnection: TestConnection;
    before('Prepare a language server for testing', async () => {
        testConnection = new TestConnection();
    });

    describe('Common scenarios', () => {
        it('Should provide a code lens to start all services at the root services node', async () => {
            const testObject = {
                services: {}
            };

            const expected = [
                {
                    range: Range.create(0, 0, 0, 8),
                    command: {
                        command: 'vscode-docker.compose.up'
                    }
                },
            ];

            const uri = testConnection.sendObjectAsYamlDocument(testObject);
            await requestServiceStartupCodeLensesAndCompare(testConnection, uri, expected);
        });

        it('Should provide a code lens for starting each service', async () => {
            const testObject = {
                version: '123',
                services: {
                    abc: {
                        image: 'alpine'
                    },
                    def: {
                        image: 'mysql:latest'
                    },
                }
            };

            const expected = [
                {
                    range: Range.create(1, 0, 1, 8),
                    command: {
                        command: 'vscode-docker.compose.up'
                    }
                },
                {
                    range: Range.create(2, 2, 2, 5),
                    command: {
                        command: 'vscode-docker.compose.up.subset',
                    }
                },
                {
                    range: Range.create(4, 2, 4, 5),
                    command: {
                        command: 'vscode-docker.compose.up.subset',
                    }
                },
            ];

            const uri = testConnection.sendObjectAsYamlDocument(testObject);
            await requestServiceStartupCodeLensesAndCompare(testConnection, uri, expected);
        });
    });

    describe('Error scenarios', () => {
        it('Should return an error for nonexistent files', () => {
            return testConnection
                .client.sendRequest(CodeLensRequest.type, { textDocument: { uri: 'file:///bogus' } })
                .should.eventually.be.rejectedWith(ResponseError);
        });

        it('Should NOT provide service startup code lenses if `services` isn\'t present', async () => {
            const uri = testConnection.sendObjectAsYamlDocument({});
            await requestServiceStartupCodeLensesAndCompare(testConnection, uri, undefined);
        });

        it('Should NOT provide service startup code lenses if `services` isn\'t a map', async () => {
            const testObject = {
                services: 'a'
            };

            const uri = testConnection.sendObjectAsYamlDocument(testObject);
            await requestServiceStartupCodeLensesAndCompare(testConnection, uri, []);
        });
    });

    after('Cleanup', () => {
        testConnection.dispose();
    });
});

async function requestServiceStartupCodeLensesAndCompare(testConnection: TestConnection, uri: DocumentUri, expected: ExpectedServiceStartupCodeLens[] | undefined): Promise<void> {
    const result = await testConnection.client.sendRequest(CodeLensRequest.type, { textDocument: { uri } }) as CodeLens[];

    if (expected === undefined) {
        expect(result).to.be.null;
        return;
    }

    expect(result).to.be.ok; // Should always be OK result even if 0 code lenses
    /* eslint-disable @typescript-eslint/no-non-null-assertion */
    result.length.should.equal(expected!.length);

    if (expected!.length) {
        // Each diagnostic should have a matching range and content canary in the results
        for (const expectedCodeLens of expected!) {
            result.some(actualCodeLens => lensesMatch(actualCodeLens, expectedCodeLens)).should.be.true;
        }
    }
    /* eslint-enable @typescript-eslint/no-non-null-assertion */
}

function lensesMatch(actual: CodeLens, expected: ExpectedServiceStartupCodeLens): boolean {
    return (
        actual.command?.command === expected.command.command &&
        actual.range.start.line === expected.range.start.line &&
        actual.range.start.character === expected.range.start.character &&
        actual.range.end.line === expected.range.end.line &&
        actual.range.end.character === expected.range.end.character
    );
}
