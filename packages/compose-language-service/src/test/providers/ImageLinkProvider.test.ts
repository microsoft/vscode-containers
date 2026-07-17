/*!--------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { expect } from 'chai';
import { DocumentLinkRequest, type DocumentUri, Range, ResponseError } from 'vscode-languageserver';
import { TestConnection } from '../TestConnection';

interface ExpectedImageLink {
    range: Range;
    target: string;
}

describe('ImageLinkProvider', () => {
    let testConnection: TestConnection;
    before('Prepare a language server for testing', () => {
        testConnection = new TestConnection();
    });

    describe('Common scenarios', () => {
        it('Should provide links for general Docker Hub images', async () => {
            const testObject = {
                version: '123',
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
                    range: Range.create(3, 11, 3, 17),
                    target: 'https://hub.docker.com/_/alpine'
                },
                {
                    range: Range.create(5, 11, 5, 16),
                    target: 'https://hub.docker.com/_/mysql'
                },
            ];

            const uri = testConnection.sendObjectAsYamlDocument(testObject);
            await requestImageLinksAndCompare(testConnection, uri, expected);
        });

        it('Should provide links with the correct location for quoted images', async () => {
            const testObject = `version: '123'
services:
  a:
    image: 'alpine'
  b:
    image: "mysql:latest"
`;

            const expected = [
                {
                    range: Range.create(3, 12, 3, 18),
                    target: 'https://hub.docker.com/_/alpine'
                },
                {
                    range: Range.create(5, 12, 5, 17),
                    target: 'https://hub.docker.com/_/mysql'
                },
            ];

            const uri = testConnection.sendTextAsYamlDocument(testObject);
            await requestImageLinksAndCompare(testConnection, uri, expected);
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
                    range: Range.create(2, 11, 2, 25),
                    target: 'https://hub.docker.com/r/library/alpine'
                },
                {
                    range: Range.create(4, 11, 4, 24),
                    target: 'https://hub.docker.com/r/library/mysql'
                },
            ];

            const uri = testConnection.sendObjectAsYamlDocument(testObject);
            await requestImageLinksAndCompare(testConnection, uri, expected);
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
                    range: Range.create(2, 11, 2, 39),
                    target: 'https://hub.docker.com/_/microsoft-dotnet-sdk'
                },
                {
                    range: Range.create(4, 11, 4, 42),
                    target: 'https://hub.docker.com/_/microsoft-dotnet-aspnet'
                },
                {
                    range: Range.create(6, 11, 6, 44),
                    target: 'https://hub.docker.com/_/microsoft-dotnet-core-sdk'
                },
                {
                    range: Range.create(8, 11, 8, 47),
                    target: 'https://hub.docker.com/_/microsoft-dotnet-core-aspnet'
                },
            ];

            const uri = testConnection.sendObjectAsYamlDocument(testObject);
            await requestImageLinksAndCompare(testConnection, uri, expected);
        });

        it('Should provide links for GitHub Container Registry images', async () => {
            const testObject = {
                services: {
                    a: {
                        image: 'ghcr.io/microsoft/playwright-mcp'
                    },
                    b: {
                        image: 'ghcr.io/owner/repo:v1.2.3'
                    },
                }
            };

            const expected = [
                {
                    range: Range.create(2, 11, 2, 43),
                    target: 'https://github.com/microsoft/playwright-mcp/pkgs/container/playwright-mcp'
                },
                {
                    range: Range.create(4, 11, 4, 29),
                    target: 'https://github.com/owner/repo/pkgs/container/repo'
                },
            ];

            const uri = testConnection.sendObjectAsYamlDocument(testObject);
            await requestImageLinksAndCompare(testConnection, uri, expected);
        });

        it('Should provide links for Quay.io images', async () => {
            const testObject = {
                services: {
                    a: {
                        image: 'quay.io/prometheus/node-exporter'
                    },
                    b: {
                        image: 'quay.io/coreos/etcd:v3.5.0'
                    },
                }
            };

            const expected = [
                {
                    range: Range.create(2, 11, 2, 43),
                    target: 'https://quay.io/repository/prometheus/node-exporter'
                },
                {
                    range: Range.create(4, 11, 4, 30),
                    target: 'https://quay.io/repository/coreos/etcd'
                },
            ];

            const uri = testConnection.sendObjectAsYamlDocument(testObject);
            await requestImageLinksAndCompare(testConnection, uri, expected);
        });

        it('Should provide links for explicit Docker Hub registry hostnames', async () => {
            const testObject = {
                services: {
                    a: {
                        image: 'docker.io/library/alpine'
                    },
                    b: {
                        image: 'docker.io/alpine'
                    },
                    c: {
                        image: 'index.docker.io/someuser/someimage:1.0'
                    },
                }
            };

            const expected = [
                {
                    range: Range.create(2, 11, 2, 35),
                    target: 'https://hub.docker.com/r/library/alpine'
                },
                {
                    range: Range.create(4, 11, 4, 27),
                    target: 'https://hub.docker.com/_/alpine'
                },
                {
                    range: Range.create(6, 11, 6, 45),
                    target: 'https://hub.docker.com/r/someuser/someimage'
                },
            ];

            const uri = testConnection.sendObjectAsYamlDocument(testObject);
            await requestImageLinksAndCompare(testConnection, uri, expected);
        });

        it('Should provide links for digest-pinned images, excluding the digest from the link range', async () => {
            const testObject = {
                services: {
                    a: {
                        image: 'alpine@sha256:1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef'
                    },
                    b: {
                        image: 'ghcr.io/owner/repo@sha256:abcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcd'
                    },
                    c: {
                        image: 'redis:7@sha256:fedcbafedcbafedcbafedcbafedcbafedcbafedcbafedcbafedcbafedcbafedc'
                    },
                }
            };

            const expected = [
                {
                    range: Range.create(2, 11, 2, 17),
                    target: 'https://hub.docker.com/_/alpine'
                },
                {
                    range: Range.create(4, 11, 4, 29),
                    target: 'https://github.com/owner/repo/pkgs/container/repo'
                },
                {
                    range: Range.create(6, 11, 6, 16),
                    target: 'https://hub.docker.com/_/redis'
                },
            ];

            const uri = testConnection.sendObjectAsYamlDocument(testObject);
            await requestImageLinksAndCompare(testConnection, uri, expected);
        });

        it('Should provide links for registry hostnames case-insensitively', async () => {
            const testObject = {
                services: {
                    a: {
                        image: 'MCR.microsoft.com/dotnet/sdk'
                    },
                }
            };

            const expected = [
                {
                    range: Range.create(2, 11, 2, 39),
                    target: 'https://hub.docker.com/_/microsoft-dotnet-sdk'
                },
            ];

            const uri = testConnection.sendObjectAsYamlDocument(testObject);
            await requestImageLinksAndCompare(testConnection, uri, expected);
        });

        it('Should NOT link an uppercase first component to Docker Hub', async () => {
            // An uppercase first component is a registry host per Docker's rules (namespaces are
            // always lowercase), so it must not be mistaken for a Docker Hub namespace.
            const testObject = {
                services: {
                    a: {
                        image: 'MyRegistry.example/foo'
                    },
                    b: {
                        image: 'MyRegistry/foo'
                    },
                }
            };

            const uri = testConnection.sendObjectAsYamlDocument(testObject);
            await requestImageLinksAndCompare(testConnection, uri, []);
        });

        it('Should NOT provide links for unrecognized private registries', async () => {
            // Reproduces the scenario reported in https://github.com/microsoft/compose-language-service/issues/179
            const testObject = {
                services: {
                    a: {
                        image: 'nrt.vultrcr.com/wulicoco/code-sync'
                    },
                    b: {
                        image: 'localhost:5000/myimg'
                    },
                    c: {
                        image: 'registry.gitlab.com/group/project/image'
                    },
                }
            };

            const uri = testConnection.sendObjectAsYamlDocument(testObject);
            await requestImageLinksAndCompare(testConnection, uri, []);
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

            const uri = testConnection.sendObjectAsYamlDocument(testObject);
            await requestImageLinksAndCompare(testConnection, uri, []);
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

            const uri = testConnection.sendObjectAsYamlDocument(testObject);
            await requestImageLinksAndCompare(testConnection, uri, []);
        });

        it('Should NOT provide links for multi-namespaced images', async () => {
            const testObject = {
                services: {
                    a: {
                        image: 'foo/bar/alpine'
                    },
                }
            };

            const uri = testConnection.sendObjectAsYamlDocument(testObject);
            await requestImageLinksAndCompare(testConnection, uri, []);
        });

        it('Should NOT provide links for GHCR or Quay images with a deeper namespace', async () => {
            // GHCR/Quay pages only map cleanly for a single `<owner>/<repo>` form
            const testObject = {
                services: {
                    a: {
                        image: 'ghcr.io/owner/team/repo'
                    },
                    b: {
                        image: 'quay.io/org/team/repo:v1.0.0'
                    },
                }
            };

            const uri = testConnection.sendObjectAsYamlDocument(testObject);
            await requestImageLinksAndCompare(testConnection, uri, []);
        });

        it('Should NOT provide links for registry images without a namespace', async () => {
            const testObject = {
                services: {
                    a: {
                        image: 'ghcr.io/repo'
                    },
                    b: {
                        image: 'quay.io/repo'
                    },
                    c: {
                        image: 'mcr.microsoft.com/sdk'
                    },
                }
            };

            const uri = testConnection.sendObjectAsYamlDocument(testObject);
            await requestImageLinksAndCompare(testConnection, uri, []);
        });

        it('Should NOT provide links for services without image tag', async () => {
            const testObject = {
                services: {
                    a: {
                        // eslint-disable-next-line @typescript-eslint/naming-convention
                        'container_name': 'a'
                    },
                }
            };

            const uri = testConnection.sendObjectAsYamlDocument(testObject);
            await requestImageLinksAndCompare(testConnection, uri, []);
        });
    });

    describe('Error scenarios', () => {
        it('Should return an error for nonexistent files', () => {
            return testConnection
                .client.sendRequest(DocumentLinkRequest.type, { textDocument: { uri: 'file:///bogus' } })
                .should.eventually.be.rejectedWith(ResponseError);
        });

        it('Should NOT provide links if `services` isn\'t present', async () => {
            const uri = testConnection.sendObjectAsYamlDocument({});
            await requestImageLinksAndCompare(testConnection, uri, []);
        });

        it('Should NOT provide links if `services` isn\'t a map', async () => {
            const testObject = {
                services: 'a'
            };

            const uri = testConnection.sendObjectAsYamlDocument(testObject);
            await requestImageLinksAndCompare(testConnection, uri, []);
        });

        it('Should NOT provide links if `services` is empty', async () => {
            const testObject = {
                services: {}
            };

            const uri = testConnection.sendObjectAsYamlDocument(testObject);
            await requestImageLinksAndCompare(testConnection, uri, []);
        });

        it('Should NOT provide links if the service itself isn\'t a map', async () => {
            const testObject = {
                services: {
                    a: 'a'
                }
            };

            const uri = testConnection.sendObjectAsYamlDocument(testObject);
            await requestImageLinksAndCompare(testConnection, uri, []);
        });

        it('Should NOT provide links if the service itself is empty', async () => {
            const testObject = {
                services: {
                    a: {}
                }
            };

            const uri = testConnection.sendObjectAsYamlDocument(testObject);
            await requestImageLinksAndCompare(testConnection, uri, []);
        });

        it('Should NOT provide links if the image isn\'t a scalar', async () => {
            const testObject = {
                services: {
                    image: {
                        a: 'b'
                    }
                }
            };

            const uri = testConnection.sendObjectAsYamlDocument(testObject);
            await requestImageLinksAndCompare(testConnection, uri, []);
        });

        it('Should NOT provide links if the image isn\'t a string scalar', async () => {
            const testObject = {
                services: {
                    image: 1
                }
            };

            const uri = testConnection.sendObjectAsYamlDocument(testObject);
            await requestImageLinksAndCompare(testConnection, uri, []);
        });

        it('Should NOT provide links if the image is empty', async () => {
            const testObject = {
                services: {
                    image: {}
                }
            };

            const uri = testConnection.sendObjectAsYamlDocument(testObject);
            await requestImageLinksAndCompare(testConnection, uri, []);
        });
    });

    after('Cleanup', () => {
        testConnection.dispose();
    });
});

async function requestImageLinksAndCompare(testConnection: TestConnection, uri: DocumentUri, expected: ExpectedImageLink[]): Promise<void> {
    const result = (await testConnection.client.sendRequest(DocumentLinkRequest.type, { textDocument: { uri } }))!;

    expect(result).to.be.ok; // Should always be OK result even if 0 links

    if (expected.length > 0) {
        result.should.not.be.empty;
        result.should.have.deep.members(expected);
    } else {
        result.should.be.empty;
    }
}
