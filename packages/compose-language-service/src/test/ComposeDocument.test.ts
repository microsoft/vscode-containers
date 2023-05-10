/*!--------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { expect } from 'chai';
import { InitializeParams, Position, TextDocuments } from 'vscode-languageserver';
import type { ComposeLanguageClientCapabilities } from '../client/ClientCapabilities';
import { DocumentSettings, DocumentSettingsNotification, DocumentSettingsNotificationParams, DocumentSettingsRequest, LF } from '../client/DocumentSettings';
import { ComposeDocument } from '../service/ComposeDocument';
import { ExtendedPositionParams, PositionInfo } from '../service/ExtendedParams';
import { runWithContext } from '../service/utils/ActionContext';
import { DefaultInitializeParams, TestConnection } from './TestConnection';

const DocumentSettingsClientCapabilities: ComposeLanguageClientCapabilities = {
    experimental: {
        documentSettings: {
            notify: true,
            request: true,
        },
    },
};

// Almost all of the tests can be performed with a single test document
const sharedTestDoc: string = `version: '3.4'

# This line is a comment

services:
    foo:
        image: bar
        build:
            context: .
            dockerfile: Dockerfile
        ports:
            - target: 80
              published: 8080
              protocol: tcp
              mode: host
            - "5000"
        profiles: ["service", "db"]
        volumes: # With a bonus comment
            - "foo:/bar:ro"
        `;

describe('ComposeDocument', () => {
    let testConnection: TestConnection;
    let sharedComposeDocument: ComposeDocument;

    let noDocSettingsConnection: TestConnection;
    let noDocSettingsSharedComposeDocument: ComposeDocument;

    before('Prepare a language server for testing (with added document settings capability)', async () => {
        const initParams: InitializeParams = {
            ...DefaultInitializeParams,
            ...{ capabilities: DocumentSettingsClientCapabilities },
        };
        testConnection = new TestConnection(initParams);

        // Set up a client listener to respond to doc settings requests
        testConnection.client.onRequest(DocumentSettingsRequest.method, (params) => {
            return {
                eol: LF,
                tabSize: 4,
            };
        });

        sharedComposeDocument = await sendAndAwaitDocument(testConnection, sharedTestDoc);

        // Set up another connection that will lack the doc settings capabilities
        noDocSettingsConnection = new TestConnection();
        noDocSettingsSharedComposeDocument = await sendAndAwaitDocument(noDocSettingsConnection, sharedTestDoc);
    });

    describe('Common scenarios', () => {
        describe('Position / path scenarios', () => {
            it('Position info should be correct for keys at root', async () => {
                const versionKeyPosition: PositionInfo = {
                    indentDepth: 0,
                    path: '/version',
                };

                await getPathAndCompare(
                    testConnection,
                    sharedComposeDocument,
                    Position.create(0, 0), // Beginning of `version`
                    versionKeyPosition
                );

                await getPathAndCompare(
                    testConnection,
                    sharedComposeDocument,
                    Position.create(0, 3), // Middle of `version`
                    versionKeyPosition
                );

                await getPathAndCompare(
                    testConnection,
                    sharedComposeDocument,
                    Position.create(0, 6), // End of `version`
                    versionKeyPosition
                );

                const serviceKeyPosition: PositionInfo = {
                    indentDepth: 0,
                    path: '/services',
                };

                await getPathAndCompare(
                    testConnection,
                    sharedComposeDocument,
                    Position.create(4, 0), // Beginning of `services`
                    serviceKeyPosition
                );

                await getPathAndCompare(
                    testConnection,
                    sharedComposeDocument,
                    Position.create(4, 3), // Middle of `services`
                    serviceKeyPosition
                );

                const noKeyPosition: PositionInfo = {
                    indentDepth: 0,
                    path: '/',
                };

                await getPathAndCompare(
                    testConnection,
                    sharedComposeDocument,
                    Position.create(1, 0), // The blank line between `version` and the comment
                    noKeyPosition
                );

                await getPathAndCompare(
                    testConnection,
                    sharedComposeDocument,
                    Position.create(19, 0), // The blank line at the end
                    noKeyPosition
                );
            });

            it('Position info should be correct for keys at not-root', async () => {
                const fooServiceKeyPosition: PositionInfo = {
                    indentDepth: 1,
                    path: '/services/foo',
                };

                await getPathAndCompare(
                    testConnection,
                    sharedComposeDocument,
                    Position.create(5, 4), // The beginning of service `foo`
                    fooServiceKeyPosition
                );

                await getPathAndCompare(
                    testConnection,
                    sharedComposeDocument,
                    Position.create(5, 5), // The middle of service `foo`
                    fooServiceKeyPosition
                );

                await getPathAndCompare(
                    testConnection,
                    sharedComposeDocument,
                    Position.create(5, 6), // The end of service `foo`
                    fooServiceKeyPosition
                );

                const dockerfileKeyPosition: PositionInfo = {
                    indentDepth: 3,
                    path: '/services/foo/build/dockerfile',
                };

                await getPathAndCompare(
                    testConnection,
                    sharedComposeDocument,
                    Position.create(9, 15), // The middle of the `dockerfile` key
                    dockerfileKeyPosition
                );
            });

            it('Position info should be correct for separator after keys', async () => {
                const versionKeySepPosition: PositionInfo = {
                    indentDepth: 0,
                    path: '/version/<sep>',
                };

                await getPathAndCompare(
                    testConnection,
                    sharedComposeDocument,
                    Position.create(0, 7), // The separator after `version`
                    versionKeySepPosition
                );

                const fooKeySepPosition: PositionInfo = {
                    indentDepth: 1,
                    path: '/services/foo/<sep>',
                };

                await getPathAndCompare(
                    testConnection,
                    sharedComposeDocument,
                    Position.create(5, 7), // The separator after `foo`
                    fooKeySepPosition
                );

                const portPublishedKeySep: PositionInfo = {
                    indentDepth: 3.5,
                    path: '/services/foo/ports/<item>/published/<sep>'
                };

                await getPathAndCompare(
                    testConnection,
                    sharedComposeDocument,
                    Position.create(12, 23), // The separator after `published` under the port
                    portPublishedKeySep
                );
            });

            it('Position info should be correct for scalar values of keys', async () => {
                const versionValuePosition: PositionInfo = {
                    indentDepth: 0,
                    path: '/version/<value>',
                };

                await getPathAndCompare(
                    testConnection,
                    sharedComposeDocument,
                    Position.create(0, 8), // The space ahead of the value of `version`
                    versionValuePosition
                );

                await getPathAndCompare(
                    testConnection,
                    sharedComposeDocument,
                    Position.create(0, 9), // The beginning of the value of `version`
                    versionValuePosition
                );

                await getPathAndCompare(
                    testConnection,
                    sharedComposeDocument,
                    Position.create(0, 11), // The middle of the value of `version`
                    versionValuePosition
                );

                await getPathAndCompare(
                    testConnection,
                    sharedComposeDocument,
                    Position.create(0, 13), // The end of the value of `version`
                    versionValuePosition
                );

                const dockerfileValuePosition: PositionInfo = {
                    indentDepth: 3,
                    path: '/services/foo/build/dockerfile/<value>',
                };

                await getPathAndCompare(
                    testConnection,
                    sharedComposeDocument,
                    Position.create(9, 23), // The space ahead of the value of `dockerfile`
                    dockerfileValuePosition
                );

                await getPathAndCompare(
                    testConnection,
                    sharedComposeDocument,
                    Position.create(9, 24), // The beginning of the value of `dockerfile`
                    dockerfileValuePosition
                );

                await getPathAndCompare(
                    testConnection,
                    sharedComposeDocument,
                    Position.create(9, 27), // The middle of the value of `dockerfile`
                    dockerfileValuePosition
                );

                await getPathAndCompare(
                    testConnection,
                    sharedComposeDocument,
                    Position.create(9, 32), // The end of the value of `dockerfile`
                    dockerfileValuePosition
                );
            });

            it('Position info should be correct for collection values', async () => {
                const portItemValuePosition: PositionInfo = {
                    indentDepth: 3,
                    path: '/services/foo/ports/<item>/<value>',
                };

                await getPathAndCompare(
                    testConnection,
                    sharedComposeDocument,
                    Position.create(15, 13), // The space ahead of the value of `ports[1]`
                    portItemValuePosition
                );

                await getPathAndCompare(
                    testConnection,
                    sharedComposeDocument,
                    Position.create(15, 14), // The beginning of the value of `ports[1]`
                    portItemValuePosition
                );

                await getPathAndCompare(
                    testConnection,
                    sharedComposeDocument,
                    Position.create(15, 17), // The middle of the value of `ports[1]`
                    portItemValuePosition
                );

                await getPathAndCompare(
                    testConnection,
                    sharedComposeDocument,
                    Position.create(15, 19), // The end of the value of `ports[1]`
                    portItemValuePosition
                );
            });

            it('Position info should be correct for collection values that are flow maps', async () => {
                const portItemTargetValuePosition: PositionInfo = {
                    indentDepth: 3,
                    path: '/services/foo/ports/<item>/target/<value>',
                };

                await getPathAndCompare(
                    testConnection,
                    sharedComposeDocument,
                    Position.create(11, 21), // The space ahead of the value of `ports[0]/target`
                    portItemTargetValuePosition
                );

                await getPathAndCompare(
                    testConnection,
                    sharedComposeDocument,
                    Position.create(11, 22), // The beginning of the value of `ports[0]/target`
                    portItemTargetValuePosition
                );

                await getPathAndCompare(
                    testConnection,
                    sharedComposeDocument,
                    Position.create(11, 23), // The middle of the value of `ports[0]/target`
                    portItemTargetValuePosition
                );

                await getPathAndCompare(
                    testConnection,
                    sharedComposeDocument,
                    Position.create(11, 24), // The end of the value of `ports[0]/target`
                    portItemTargetValuePosition
                );
            });

            it('Position info should be correct for keys in flow maps', async () => {
                const portItemTargetPosition: PositionInfo = {
                    indentDepth: 3,
                    path: '/services/foo/ports/<item>/target',
                };

                await getPathAndCompare(
                    testConnection,
                    sharedComposeDocument,
                    Position.create(11, 13), // The space ahead of the key `ports[0]/target`
                    portItemTargetPosition
                );

                await getPathAndCompare(
                    testConnection,
                    sharedComposeDocument,
                    Position.create(11, 14), // The beginning of the key `ports[0]/target`
                    portItemTargetPosition
                );

                await getPathAndCompare(
                    testConnection,
                    sharedComposeDocument,
                    Position.create(11, 16), // The middle of the key `ports[0]/target`
                    portItemTargetPosition
                );

                await getPathAndCompare(
                    testConnection,
                    sharedComposeDocument,
                    Position.create(11, 19), // The end of the key `ports[0]/target`
                    portItemTargetPosition
                );

                const portItemPublishedPosition: PositionInfo = {
                    indentDepth: 3.5,
                    path: '/services/foo/ports/<item>/published',
                };

                await getPathAndCompare(
                    testConnection,
                    sharedComposeDocument,
                    Position.create(12, 14), // The beginning of the key `ports[0]/published`
                    portItemPublishedPosition
                );

                await getPathAndCompare(
                    testConnection,
                    sharedComposeDocument,
                    Position.create(12, 16), // The middle of the key `ports[0]/published`
                    portItemPublishedPosition
                );

                await getPathAndCompare(
                    testConnection,
                    sharedComposeDocument,
                    Position.create(12, 22), // The end of the key `ports[0]/published`
                    portItemPublishedPosition
                );
            });

            it('Position info should be correct for separator in collection values', async () => {
                const portItemSepPosition: PositionInfo = {
                    indentDepth: 3,
                    path: '/services/foo/ports/<item>/<sep>',
                };

                await getPathAndCompare(
                    testConnection,
                    sharedComposeDocument,
                    Position.create(15, 12), // The separator ahead of the value of `ports[1]`
                    portItemSepPosition
                );
            });

            it('Position info should be correct for separator in collection values that are flow maps', async () => {
                const portItemSepPosition: PositionInfo = {
                    indentDepth: 3,
                    path: '/services/foo/ports/<item>/<sep>',
                };

                await getPathAndCompare(
                    testConnection,
                    sharedComposeDocument,
                    Position.create(11, 12), // The separator ahead of the value of `ports[0]`
                    portItemSepPosition
                );

                const portItemTargetSepPosition: PositionInfo = {
                    indentDepth: 3,
                    path: '/services/foo/ports/<item>/target/<sep>',
                };

                await getPathAndCompare(
                    testConnection,
                    sharedComposeDocument,
                    Position.create(11, 20), // The separator after target in `ports[0]`
                    portItemTargetSepPosition
                );
            });

            it('Position info should be correct for values that are flow sequences', async () => {
                const profilesValuePosition: PositionInfo = {
                    indentDepth: 2,
                    path: '/services/foo/profiles/<value>',
                };

                await getPathAndCompare(
                    testConnection,
                    sharedComposeDocument,
                    Position.create(16, 17), // The space ahead of the value of `profiles`
                    profilesValuePosition
                );

                await getPathAndCompare(
                    testConnection,
                    sharedComposeDocument,
                    Position.create(16, 18), // The beginning of the value of `profiles`
                    profilesValuePosition
                );

                await getPathAndCompare(
                    testConnection,
                    sharedComposeDocument,
                    Position.create(16, 20), // The middle of the value of `profiles`
                    profilesValuePosition
                );

                await getPathAndCompare(
                    testConnection,
                    sharedComposeDocument,
                    Position.create(16, 34), // The end of the value of `profiles`
                    profilesValuePosition
                );
            });

            it('Position info should be correct for whitespace-only lines', async () => {
                const whitespacePosition: PositionInfo = {
                    indentDepth: 0,
                    path: '/',
                };

                await getPathAndCompare(
                    testConnection,
                    sharedComposeDocument,
                    Position.create(1, 0), // The blank line after `version`
                    whitespacePosition
                );

                const servicesKeyPosition: PositionInfo = {
                    indentDepth: 1,
                    path: '/services',
                };

                await getPathAndCompare(
                    testConnection,
                    sharedComposeDocument,
                    Position.create(19, 4), // The last line in the doc, with the cursor 1 indent over
                    servicesKeyPosition
                );

                const fooKeyPosition: PositionInfo = {
                    indentDepth: 2,
                    path: '/services/foo',
                };

                await getPathAndCompare(
                    testConnection,
                    sharedComposeDocument,
                    Position.create(19, 8), // The last line in the doc, with the cursor 2 indents over
                    fooKeyPosition
                );
            });

            it('Position info should be correct for comments', async () => {
                const commentPosition: PositionInfo = {
                    indentDepth: -1,
                    path: '/<comment>',
                };

                await getPathAndCompare(
                    testConnection,
                    sharedComposeDocument,
                    Position.create(2, 1), // The comment after `version`
                    commentPosition
                );

                await getPathAndCompare(
                    testConnection,
                    sharedComposeDocument,
                    Position.create(17, 18), // The comment after `volumes:`
                    commentPosition
                );
            });

            it('Position info should be correct for lines with comments, but position is before the comment', async () => {
                const volumesKeyPosition: PositionInfo = {
                    indentDepth: 2,
                    path: '/services/foo/volumes',
                };

                await getPathAndCompare(
                    testConnection,
                    sharedComposeDocument,
                    Position.create(17, 8), // The beginning of `volumes:`
                    volumesKeyPosition
                );

                await getPathAndCompare(
                    testConnection,
                    sharedComposeDocument,
                    Position.create(17, 11), // The middle of `volumes:`
                    volumesKeyPosition
                );

                await getPathAndCompare(
                    testConnection,
                    sharedComposeDocument,
                    Position.create(17, 14), // The end of `volumes:`
                    volumesKeyPosition
                );

                const volumesKeySepPosition: PositionInfo = {
                    indentDepth: 2,
                    path: '/services/foo/volumes/<sep>',
                };

                await getPathAndCompare(
                    testConnection,
                    sharedComposeDocument,
                    Position.create(17, 15), // The separator after `volumes:`
                    volumesKeySepPosition
                );

                const volumesValuePosition: PositionInfo = {
                    indentDepth: 2,
                    path: '/services/foo/volumes/<value>',
                };

                await getPathAndCompare(
                    testConnection,
                    sharedComposeDocument,
                    Position.create(17, 16), // The space ahead of the comment after `volumes:`
                    volumesValuePosition
                );
            });
        });

        describe('Basic scenarios', () => {
            it('Should have a parsed YAML document that is computed on-demand', () => {
                sharedComposeDocument.yamlDocument.hasValue().should.be.false;
                sharedComposeDocument.yamlDocument.value.should.be.ok;
                sharedComposeDocument.yamlDocument.hasValue().should.be.true;
            });

            it('Should give lines correctly for numeric inputs', () => {
                sharedComposeDocument.lineAt(0).should.equal('version: \'3.4\'\n');
                sharedComposeDocument.lineAt(1).should.equal('\n');
                sharedComposeDocument.lineAt(2).should.equal('# This line is a comment\n');
                sharedComposeDocument.lineAt(17).should.equal('        volumes: # With a bonus comment\n');
            });

            it('Should give lines correctly for position inputs', () => {
                sharedComposeDocument.lineAt(Position.create(0, 0)).should.equal('version: \'3.4\'\n');
                sharedComposeDocument.lineAt(Position.create(1, 111)).should.equal('\n'); // 111 should round backward to the end of this line
                sharedComposeDocument.lineAt(Position.create(2, 4)).should.equal('# This line is a comment\n');
                sharedComposeDocument.lineAt(Position.create(17, 0)).should.equal('        volumes: # With a bonus comment\n');
            });
        });

        describe('DocumentSettings scenarios', () => {
            it('Should guess document settings correctly if the client doesn\'t support DocumentSettings', async () => {
                // Clear out the settings first, to force the ComposeDocument to recompute it
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                (noDocSettingsSharedComposeDocument as any).documentSettings = undefined;

                const settings = await runWithContext(noDocSettingsConnection.getMockContext(), async () => {
                    return noDocSettingsSharedComposeDocument.getSettings();
                });

                settings.eol.should.equal(LF);
                settings.tabSize.should.equal(4);
            });

            it('Should guess document settings, even for empty docs', async () => {
                const emptyDoc = await sendAndAwaitDocument(noDocSettingsConnection, '');

                const settings = await runWithContext(noDocSettingsConnection.getMockContext(), async () => {
                    return emptyDoc.getSettings();
                });

                settings.eol.should.equal(LF);
                settings.tabSize.should.equal(2); // The default is 2 spaces
            });

            it('Should ask client for document settings if the client does support DocumentSettings', async () => {
                // Clear out the settings first, to force the ComposeDocument to recompute it
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                (sharedComposeDocument as any).documentSettings = undefined;

                const requestPromise = new Promise<void>((resolve, reject) => {
                    testConnection.client.onRequest(DocumentSettingsRequest.method, (params) => {
                        resolve();
                        return {
                            eol: LF,
                            tabSize: 4,
                        };
                    });

                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    (sharedComposeDocument as any).guessDocumentSettings = function () {
                        reject('Should not be guessing settings if the client can answer');
                    };
                });

                const ctx = testConnection.getMockContext();

                const resultPromise = runWithContext(ctx, async () => {
                    return sharedComposeDocument.getSettings();
                });

                await Promise.all([requestPromise, resultPromise]);
                const settings = await resultPromise;

                settings.eol.should.equal(LF);
                settings.tabSize.should.equal(4);
            });

            it('Should accept DocumentSettingsNotifications', async () => {
                const params: DocumentSettingsNotificationParams = {
                    textDocument: sharedComposeDocument.id,
                    eol: LF,
                    tabSize: 3,
                };

                void testConnection.client.sendNotification(DocumentSettingsNotification.type, params);

                // Wait for the service to process the notification
                await new Promise<void>((resolve) => {
                    // Override the updateSettings function on the document in order to be able to wait for it to be called
                    // It's amazing what JavaScript lets you do
                    const oldUpdateSettings = sharedComposeDocument.updateSettings.bind(sharedComposeDocument);
                    sharedComposeDocument.updateSettings = function (settings) {
                        oldUpdateSettings(settings);
                        resolve();
                    };
                });

                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const settings = (sharedComposeDocument as any).documentSettings as DocumentSettings;
                settings.eol.should.equal(LF);
                settings.tabSize.should.equal(3);
            });
        });
    });

    describe('Error scenarios', () => {
        it('Should NOT throw for an empty document', () => {
            testConnection.sendTextAsYamlDocument('');
        });

        it('Should NOT throw for a syntactically-incorrect document', () => {
            const malformedTestObject = `[bar : foo`;
            testConnection.sendTextAsYamlDocument(malformedTestObject);
        });

        it('Should NOT throw for a compound document', () => {
            const compoundDocument = `---
services:
  foo:
    image: redis

---
services:
  bar:
    image: alpine`;
            testConnection.sendTextAsYamlDocument(compoundDocument);
        });

        it('Should throw for lines out of bounds', () => {
            expect(() => sharedComposeDocument.lineAt(1000)).to.throw('out of bounds');
            expect(() => sharedComposeDocument.lineAt(Position.create(1000, 0))).to.throw('out of bounds');
        });
    });

    after('Cleanup', () => {
        testConnection.dispose();
        noDocSettingsConnection.dispose();
    });
});

async function sendAndAwaitDocument(testConnection: TestConnection, document: string): Promise<ComposeDocument> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const testConnectionDocManager = (testConnection.languageService as any).documentManager as TextDocuments<ComposeDocument>;

    // Set up a listener so we can wait for the service to get the document
    const waitListener = new Promise<void>((resolve) => {
        const disposable = testConnectionDocManager.onDidChangeContent(() => {
            disposable.dispose();
            resolve();
        });
    });

    // Send the doc and wait for the service to get it
    const uri = testConnection.sendTextAsYamlDocument(document);
    await waitListener;

    // Grab the doc
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    return testConnectionDocManager.get(uri)!;
}

async function getPathAndCompare(testConnection: TestConnection, document: ComposeDocument, position: Position, expected: PositionInfo): Promise<void> {
    const params: ExtendedPositionParams = {
        textDocument: document.id,
        document: document,
        position: position,
    };

    const actual = await runWithContext(testConnection.getMockContext(), async () => {
        return document.getPositionInfo(params);
    });

    expected.should.deep.equal(actual);
}
