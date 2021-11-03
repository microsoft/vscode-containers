/*!--------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { expect } from 'chai';
import { DocumentUri, Hover, HoverRequest, MarkupContent, Position, Range, ResponseError } from 'vscode-languageserver';
import { TestConnection } from '../TestConnection';

interface ExpectedHover {
    range: Range;
    contentsCanary: string; // A string which ought to be in the contents of the hover text
}

describe('KeyHoverProvider', () => {
    let testConnection: TestConnection;
    before('Prepare a language server for testing', async () => {
        testConnection = new TestConnection();
    });

    describe('Common scenarios', () => {
        it('Should provide hovers for known keys', async () => {
            const testObject = {
                version: '123',
                services: {
                    abcd: {
                        image: 'foo',
                        build: '.',
                        ports: [
                            '1234',
                            '5678:9012',
                        ],
                    },
                },
            };

            const uri = testConnection.sendObjectAsYamlDocument(testObject);

            const position1 = Position.create(0, 3); // Inside `version`
            const expected1: ExpectedHover = {
                range: Range.create(0, 0, 0, 7),
                contentsCanary: 'version',
            };

            const position2 = Position.create(1, 0); // First character of `services`
            const expected2: ExpectedHover = {
                range: Range.create(1, 0, 1, 8),
                contentsCanary: 'services',
            };

            const position3 = Position.create(1, 7); // Last character of `services`
            const expected3: ExpectedHover = {
                range: Range.create(1, 0, 1, 8),
                contentsCanary: 'services',
            };

            const position4 = Position.create(3, 4); // First character of `image`
            const expected4: ExpectedHover = {
                range: Range.create(3, 4, 3, 9),
                contentsCanary: 'image',
            };

            const position5 = Position.create(3, 8); // Last character of `image`
            const expected5: ExpectedHover = {
                range: Range.create(3, 4, 3, 9),
                contentsCanary: 'image',
            };

            await requestHoverAndCompare(testConnection, uri, position1, expected1);
            await requestHoverAndCompare(testConnection, uri, position2, expected2);
            await requestHoverAndCompare(testConnection, uri, position3, expected3);
            await requestHoverAndCompare(testConnection, uri, position4, expected4);
            await requestHoverAndCompare(testConnection, uri, position5, expected5);
        });

        it('Should NOT provide hovers for unknown keys', async () => {
            const testObject = {
                foo: '123',
                services: {
                    abcd: {
                        image: 'foo',
                        build: '.',
                        ports: [
                            '1234',
                            '5678:9012',
                        ],
                    },
                },
            };

            const uri = testConnection.sendObjectAsYamlDocument(testObject);

            const position1 = Position.create(2, 4); // In service `abcd`
            const expected1 = undefined;

            const position2 = Position.create(0, 2); // In key `foo`
            const expected2 = undefined;

            await requestHoverAndCompare(testConnection, uri, position1, expected1);
            await requestHoverAndCompare(testConnection, uri, position2, expected2);
        });

        it('Should NOT provide hovers for values', async () => {
            const testObject = {
                version: '123',
                services: {
                    abcd: {
                        image: 'foo',
                        build: '.',
                        ports: [
                            '1234',
                            '5678:9012',
                        ],
                    },
                },
            };

            const uri = testConnection.sendObjectAsYamlDocument(testObject);

            const position1 = Position.create(0, 11); // In version '123'
            const expected1 = undefined;

            const position2 = Position.create(6, 11); // In port `1234`
            const expected2 = undefined;

            const position3 = Position.create(7, 8); // First character of port `5678:9012`
            const expected3 = undefined;

            const position4 = Position.create(3, 13); // Last character of image `foo`
            const expected4 = undefined;

            await requestHoverAndCompare(testConnection, uri, position1, expected1);
            await requestHoverAndCompare(testConnection, uri, position2, expected2);
            await requestHoverAndCompare(testConnection, uri, position3, expected3);
            await requestHoverAndCompare(testConnection, uri, position4, expected4);
        });

        it('Should NOT provide hovers for separators', async () => {
            const testObject = {
                version: '123',
                services: {
                    abcd: {
                        image: 'foo',
                        build: '.',
                        ports: [
                            '1234',
                            '5678:9012',
                        ],
                    },
                },
            };

            const uri = testConnection.sendObjectAsYamlDocument(testObject);

            const position1 = Position.create(0, 7); // In version's separator (the colon)
            const expected1 = undefined;

            const position2 = Position.create(6, 6); // In port 1234's separator (the dash)
            const expected2 = undefined;

            await requestHoverAndCompare(testConnection, uri, position1, expected1);
            await requestHoverAndCompare(testConnection, uri, position2, expected2);
        });

        it('Should NOT provide hovers for comments', async () => {
            const testObject = `version: '123'
# Hello world!
services:
  foo:
    image: redis`;

            const uri = testConnection.sendTextAsYamlDocument(testObject);

            const position1 = Position.create(1, 0); // In the comment's #
            const expected1 = undefined;

            const position2 = Position.create(1, 1); // Inbetween the comment's # and the body
            const expected2 = undefined;

            const position3 = Position.create(1, 4); // In the comment body
            const expected3 = undefined;

            await requestHoverAndCompare(testConnection, uri, position1, expected1);
            await requestHoverAndCompare(testConnection, uri, position2, expected2);
            await requestHoverAndCompare(testConnection, uri, position3, expected3);
        });

        it('Should NOT provide hovers for whitespace', async () => {
            const testObject = {
                version: '123',
                services: {
                    abcd: {
                        image: 'foo',
                        build: '.',
                        ports: [
                            '1234',
                            '5678:9012',
                        ],
                    },
                },
            };

            const uri = testConnection.sendObjectAsYamlDocument(testObject);

            const position1 = Position.create(2, 2); // Whitespace left of `abcd`
            const expected1 = undefined;

            const position2 = Position.create(3, 10); // Whitespace between `image` and `foo`
            const expected2 = undefined;

            const position3 = Position.create(3, 2); // Whitespace left of `image`
            const expected3 = undefined;

            await requestHoverAndCompare(testConnection, uri, position1, expected1);
            await requestHoverAndCompare(testConnection, uri, position2, expected2);
            await requestHoverAndCompare(testConnection, uri, position3, expected3);
        });
    });

    describe('Error scenarios', () => {
        it('Should return an error for nonexistent files', () => {
            return testConnection
                .client.sendRequest(HoverRequest.type, { textDocument: { uri: 'file:///bogus' }, position: Position.create(0, 0) })
                .should.eventually.be.rejectedWith(ResponseError);
        });

        it('Should NOT provide hovers for nonscalar keys', async () => {
            const testObject = `version: '123'
? [services, foo]
:
  abcd:
    image: foo
    build: .`;

            const uri = testConnection.sendTextAsYamlDocument(testObject);

            const position1 = Position.create(1, 6); // Inside key `[services, foo]`
            const expected1 = undefined;

            await requestHoverAndCompare(testConnection, uri, position1, expected1);
        });
    });

    after('Cleanup', () => {
        testConnection.dispose();
    });
});

async function requestHoverAndCompare(testConnection: TestConnection, uri: DocumentUri, position: Position, expected: ExpectedHover | undefined): Promise<void> {
    const result = await testConnection.client.sendRequest(HoverRequest.type, { textDocument: { uri }, position: position }) as Hover | undefined;

    if (expected === undefined) {
        expect(result).to.not.be.ok;
    } else {
        expect(result).to.be.ok;
        expect(result?.range).to.be.ok;

        /* eslint-disable @typescript-eslint/no-non-null-assertion */
        result!.range!.should.deep.equal(expected.range);

        MarkupContent.is(result!.contents).should.be.true;
        (result!.contents as MarkupContent).value.should.contain(expected.contentsCanary);
        /* eslint-enable @typescript-eslint/no-non-null-assertion */
    }
}
