/*!--------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { expect } from 'chai';
import { DocumentLink, DocumentLinkRequest, Position, Range, ResponseError } from 'vscode-languageserver';
import { TestConnection } from './utils/TestConnection';

interface ImageLinkTestObject {
    services: {
        [key: string]: {
            image: string;
            [key: string]: unknown;
        }
    };
}

interface ExpectedImageLink {
    range: Range;
    target: string;
}

describe('ImageLinkProvider', () => {
    let testConnection: TestConnection;

    before('Populate the language server with a compose document', async () => {
        testConnection = new TestConnection();
    });

    describe('Common scenarios', async () => {
        it('Should provide links for general Docker Hub images', async () => {
            const testObject = {
                services: {
                    a: {
                        image: 'alpine'
                    },
                    b: {
                        image: 'mysql:latest'
                    },
                }
            };

            const expected = [
                {
                    range: Range.create(
                        Position.create(2, 11),
                        Position.create(2, 17)
                    ),
                    target: 'https://hub.docker.com/_/alpine'
                },
                {
                    range: Range.create(
                        Position.create(4, 11),
                        Position.create(4, 16)
                    ),
                    target: 'https://hub.docker.com/_/mysql'
                },
            ];

            await requestAndCompare(testConnection, testObject, expected);
        });

        it('Should provide links for namespaced Docker Hub images', async () => {
            const testObject = {
                services: {
                    a: {
                        image: 'library/alpine'
                    },
                    b: {
                        image: 'library/mysql:latest'
                    },
                }
            };

            const expected = [
                {
                    range: Range.create(
                        Position.create(2, 11),
                        Position.create(2, 25)
                    ),
                    target: 'https://hub.docker.com/r/library/alpine'
                },
                {
                    range: Range.create(
                        Position.create(4, 11),
                        Position.create(4, 24)
                    ),
                    target: 'https://hub.docker.com/r/library/mysql'
                },
            ];

            await requestAndCompare(testConnection, testObject, expected);
        });

        it('Should provide links for MCR images', async () => {
            const testObject = {
                services: {
                    a: {
                        image: 'mcr.microsoft.com/dotnet/sdk'
                    },
                    b: {
                        image: 'mcr.microsoft.com/dotnet/aspnet:5.0'
                    },
                    c: {
                        image: 'mcr.microsoft.com/dotnet/core/sdk'
                    },
                    d: {
                        image: 'mcr.microsoft.com/dotnet/core/aspnet:5.0'
                    },
                }
            };

            const expected = [
                {
                    range: Range.create(
                        Position.create(2, 11),
                        Position.create(2, 39)
                    ),
                    target: 'https://hub.docker.com/_/microsoft-dotnet-sdk'
                },
                {
                    range: Range.create(
                        Position.create(4, 11),
                        Position.create(4, 42)
                    ),
                    target: 'https://hub.docker.com/_/microsoft-dotnet-aspnet'
                },
                {
                    range: Range.create(
                        Position.create(6, 11),
                        Position.create(6, 44)
                    ),
                    target: 'https://hub.docker.com/_/microsoft-dotnet-core-sdk'
                },
                {
                    range: Range.create(
                        Position.create(8, 11),
                        Position.create(8, 47)
                    ),
                    target: 'https://hub.docker.com/_/microsoft-dotnet-core-aspnet'
                },
            ];

            await requestAndCompare(testConnection, testObject, expected);
        });

        it('Should NOT provide links for services with `build` section', async () => {
            const testObject = {
                services: {
                    a: {
                        image: 'alpine',
                        build: '.'
                    },
                }
            };

            await requestAndCompare(testConnection, testObject, []);
        });

        it('Should NOT provide links for other hosts', async () => {
            const testObject = {
                services: {
                    a: {
                        image: 'foo.bar/alpine'
                    },
                    b: {
                        image: 'foo:1234/alpine'
                    },
                }
            };

            await requestAndCompare(testConnection, testObject, []);
        });

        it('Should NOT provide links for multi-namespaced images', async () => {
            const testObject = {
                services: {
                    a: {
                        image: 'foo/bar/alpine'
                    },
                }
            };

            await requestAndCompare(testConnection, testObject, []);
        });

        it('Should NOT provide links for services without image tag', async () => {
            const testObject = {
                services: {
                    a: {
                        'container_name': 'a'
                    },
                }
            };

            await requestAndCompare(testConnection, testObject, []);
        });
    });

    describe('Error scenarios', async () => {
        it('Should return an error for nonexistent files', () => {
            return testConnection
                .client.sendRequest(DocumentLinkRequest.type, { textDocument: { uri: 'file:///bogus' } })
                .should.eventually.be.rejectedWith(ResponseError);
        });

        it('Should NOT provide links if `services` isn\'t present', async () => {
            await requestAndCompare(testConnection, {}, []);
        });

        it('Should NOT provide links if `services` isn\'t a map', async () => {
            const testObject = {
                services: 'a'
            };

            await requestAndCompare(testConnection, testObject, []);
        });

        it('Should NOT provide links if `services` is empty', async () => {
            const testObject = {
                services: {}
            };

            await requestAndCompare(testConnection, testObject, []);
        });

        it('Should NOT provide links if the service itself isn\'t a map', async () => {
            const testObject = {
                services: {
                    a: 'a'
                }
            };

            await requestAndCompare(testConnection, testObject, []);
        });

        it('Should NOT provide links if the service itself is empty', async () => {
            const testObject = {
                services: {
                    a: {}
                }
            };

            await requestAndCompare(testConnection, testObject, []);
        });

        it('Should NOT provide links if the image isn\'t a scalar', async () => {
            const testObject = {
                services: {
                    image: {
                        a: 'b'
                    }
                }
            };

            await requestAndCompare(testConnection, testObject, []);
        });

        it('Should NOT provide links if the image isn\'t a string scalar', async () => {
            const testObject = {
                services: {
                    image: 1
                }
            };

            await requestAndCompare(testConnection, testObject, []);
        });

        it('Should NOT provide links if the image is empty', async () => {
            const testObject = {
                services: {
                    image: {}
                }
            };

            await requestAndCompare(testConnection, testObject, []);
        });
    });

    after('Cleanup', () => {
        testConnection.dispose();
    });
});

async function requestAndCompare(testConnection: TestConnection, testObject: ImageLinkTestObject | unknown, expected: ExpectedImageLink[]): Promise<void> {
    const uri = testConnection.sendObjectAsYamlDocument(testObject);
    const result = await testConnection.client.sendRequest(DocumentLinkRequest.type, { textDocument: { uri } }) as DocumentLink[];

    expect(result).to.be.ok;

    if (expected.length > 0) {
        result.should.not.be.empty;
        result.should.deep.include.members(expected);
    } else {
        result.should.be.empty;
    }
}
