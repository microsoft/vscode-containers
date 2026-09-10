/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzExtTreeDataProvider, AzExtTreeItem, createTestActionContext, TestActionContext, UserCancelledError } from '@microsoft/vscode-azext-utils';
import { PortBinding } from '@microsoft/vscode-container-client';
import assert from 'assert';
import * as vscode from 'vscode';
import { browseContainerExternal, browseContainerIntegrated } from '../../commands/containers/browseContainer';
import { ext } from '../../extensionVariables';
import { ContainerTreeItem } from '../../tree/containers/ContainerTreeItem';

function makeContainer(ports: PortBinding[]): ContainerTreeItem {
    return new ContainerTreeItem(undefined, {
        id: 'test-container',
        name: 'test-container',
        labels: {},
        image: { originalName: 'test-image' },
        ports,
        networks: [],
        createdAt: new Date(0),
        state: 'running',
        showFiles: false,
    });
}

function port(containerPort = 80, hostPort = 8080, hostIp = '0.0.0.0'): PortBinding {
    return { containerPort, hostPort, hostIp, protocol: 'tcp' };
}

suite('(unit) browseContainer', () => {
    let context: TestActionContext;
    let externalUrls: string[];
    let resolvedUrls: string[];
    let commandCalls: { command: string; args: unknown[] }[];
    let warnings: string[];
    let originalOpenExternal: typeof vscode.env.openExternal;
    let originalAsExternalUri: typeof vscode.env.asExternalUri;
    let originalExecuteCommand: typeof vscode.commands.executeCommand;
    let originalContainersTree: typeof ext.containersTree;

    setup(async () => {
        context = await createTestActionContext();
        externalUrls = [];
        resolvedUrls = [];
        commandCalls = [];
        warnings = [];
        originalOpenExternal = vscode.env.openExternal;
        originalAsExternalUri = vscode.env.asExternalUri;
        originalExecuteCommand = vscode.commands.executeCommand;
        originalContainersTree = ext.containersTree;

        vscode.env.openExternal = async uri => {
            externalUrls.push(uri.toString());
            return true;
        };
        vscode.env.asExternalUri = async uri => {
            resolvedUrls.push(uri.toString());
            return uri;
        };
        vscode.commands.executeCommand = async (command: string, ...args: unknown[]) => {
            commandCalls.push({ command, args });
            return undefined;
        };
        context.ui.showWarningMessage = async message => {
            warnings.push(message);
            return undefined;
        };
    });

    teardown(() => {
        vscode.env.openExternal = originalOpenExternal;
        vscode.env.asExternalUri = originalAsExternalUri;
        vscode.commands.executeCommand = originalExecuteCommand;
        if (ext.containersTree !== originalContainersTree) {
            ext.containersTree.dispose();
        }
        ext.containersTree = originalContainersTree;
    });

    for (const [destination, browse] of [
        ['external', browseContainerExternal],
        ['integrated', browseContainerIntegrated],
    ] as const) {
        suite(destination, () => {
            function assertOpened(url: string): void {
                const expectedUrl = vscode.Uri.parse(url).toString();
                assert.deepStrictEqual(warnings, []);
                if (destination === 'external') {
                    assert.deepStrictEqual(externalUrls, [expectedUrl]);
                    assert.deepStrictEqual(resolvedUrls, []);
                    assert.deepStrictEqual(commandCalls, []);
                } else {
                    assert.deepStrictEqual(externalUrls, []);
                    assert.deepStrictEqual(resolvedUrls, [expectedUrl]);
                    assert.deepStrictEqual(commandCalls, [{ command: 'workbench.action.browser.open', args: [expectedUrl] }]);
                }
            }

            test('opens a single published port', async () => {
                await browse(context, makeContainer([port()]));
                assertOpened('http://localhost:8080');
                assert.strictEqual(context.telemetry.properties.possiblePorts, '80');
                assert.strictEqual(context.telemetry.properties.selectedPort, '80');
            });

            test('routes the registered container command to the selected browser', async () => {
                const command = destination === 'external'
                    ? 'vscode-containers.containers.browse'
                    : 'vscode-containers.containers.browseIntegrated';
                await originalExecuteCommand(command, makeContainer([port()]));
                assertOpened('http://localhost:8080');
            });

            test('prefers HTTPS over other common ports', async () => {
                await browse(context, makeContainer([port(), port(3000, 3000), port(443, 8443)]));
                assertOpened('https://localhost:8443');
            });

            test('recognizes the ASP.NET HTTPS port', async () => {
                await browse(context, makeContainer([port(5001, 15001)]));
                assertOpened('https://localhost:15001');
            });

            for (const host of ['0.0.0.0', '::', '127.0.0.1', '::1']) {
                test(`normalizes ${host} to localhost`, async () => {
                    await browse(context, makeContainer([port(80, 8080, host)]));
                    assertOpened('http://localhost:8080');
                });
            }

            test('wraps non-loopback IPv6 hosts in brackets', async () => {
                await browse(context, makeContainer([port(80, 8080, '2001:db8::1')]));
                assertOpened('http://[2001:db8::1]:8080');
            });

            test('deduplicates bindings by normalized host and container port', async () => {
                await browse(context, makeContainer([port(9000, 19000), port(9000, 29000, '::')]));
                assertOpened('http://localhost:19000');
                assert.strictEqual(context.telemetry.properties.possiblePorts, '9000');
            });

            test('prompts for a non-preferred port and uses its host binding', async () => {
                await context.ui.runWithInputs(['9000'], () =>
                    browse(context, makeContainer([port(9001, 19001), port(9000, 19000)])));
                assertOpened('http://localhost:19000');
                assert.strictEqual(context.telemetry.properties.selectedPort, '9000');
            });

            test('does not open a browser when port selection is cancelled', async () => {
                context.ui.showQuickPick = async () => { throw new UserCancelledError(); };
                await assert.rejects(browse(context, makeContainer([port(9000), port(9001)])), UserCancelledError);
                assert.deepStrictEqual(externalUrls, []);
                assert.deepStrictEqual(resolvedUrls, []);
                assert.deepStrictEqual(commandCalls, []);
            });

            test('warns without launching when there are no published ports', async () => {
                await browse(context, makeContainer([{ containerPort: 80 }]));
                assert.deepStrictEqual(warnings, [vscode.l10n.t('No valid ports are available.')]);
                assert.deepStrictEqual(externalUrls, []);
                assert.deepStrictEqual(resolvedUrls, []);
                assert.deepStrictEqual(commandCalls, []);
            });

            test('selects a running container when invoked without a node', async () => {
                const node = makeContainer([port()]);
                ext.containersTree = new AzExtTreeDataProvider(node, 'test');
                let refreshed = false;
                ext.containersTree.refresh = async () => { refreshed = true; };
                ext.containersTree.showTreeItemPicker = async <T extends AzExtTreeItem>(expectedContextValue: string | RegExp) => {
                    assert.ok(refreshed);
                    assert.strictEqual(expectedContextValue, ContainerTreeItem.runningContainerRegExp);
                    const pickedNode: AzExtTreeItem = node;
                    return pickedNode as T;
                };
                await browse(context);
                assertOpened('http://localhost:8080');
            });

            test('propagates browser launch errors', async () => {
                const error = new Error('Browser launch failed');
                if (destination === 'external') {
                    vscode.env.openExternal = async () => { throw error; };
                } else {
                    vscode.commands.executeCommand = async () => { throw error; };
                }
                await assert.rejects(browse(context, makeContainer([port()])), error);
            });
        });
    }

    test('has access to the Integrated Browser command', async () => {
        assert.ok((await vscode.commands.getCommands(true)).includes('workbench.action.browser.open'));
    });

    test('passes the resolved remote URL to Integrated Browser', async () => {
        vscode.env.asExternalUri = async uri => {
            assert.strictEqual(uri.toString(), 'http://localhost:8080/');
            return vscode.Uri.parse('https://forwarded.example.test/service?port=8080');
        };
        await browseContainerIntegrated(context, makeContainer([port()]));
        assert.deepStrictEqual(commandCalls, [{
            command: 'workbench.action.browser.open',
            args: ['https://forwarded.example.test/service?port=8080'],
        }]);
        assert.deepStrictEqual(externalUrls, []);
    });

    test('does not launch or fall back when URI resolution fails', async () => {
        const error = new Error('URI resolution failed');
        vscode.env.asExternalUri = async () => { throw error; };
        await assert.rejects(browseContainerIntegrated(context, makeContainer([port()])), error);
        assert.deepStrictEqual(commandCalls, []);
        assert.deepStrictEqual(externalUrls, []);
    });
});
