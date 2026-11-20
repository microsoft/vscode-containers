/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createTestActionContext } from '@microsoft/vscode-azext-utils';
import assert from 'assert';
import { mock } from 'node:test';
import * as path from 'path';
import { Uri } from 'vscode';
// Initialize the shared debug module first: it loads NetSdkDebugHelper, which extends NetCoreDebugHelper.
import '../../debugging/DebugHelper';
import { DockerDebugContext } from '../../debugging/DebugHelper';
import { DockerDebugConfiguration } from '../../debugging/DockerDebugConfigurationProvider';
import { NetCoreDebugHelper } from '../../debugging/netcore/NetCoreDebugHelper';
import { ext } from '../../extensionVariables';
import { NetCoreTaskHelper } from '../../tasks/netcore/NetCoreTaskHelper';
import { PlatformOS } from '../../utils/platform';

suite('(unit) debugging/netcore/NetCoreDebugHelper', () => {
    interface Overrides {
        args?: string[];
        sourceFileMap?: { [key: string]: string };
    }

    const root: Overrides = { args: ['legacy.dll', '--legacy'], sourceFileMap: { '/src': '/legacy' } };
    const nested: Overrides = { args: ['custom.dll', '--message', 'hello world'], sourceFileMap: { '/src': '/custom' } };
    const cases: { name: string; root?: Overrides; nested?: Overrides; expected: Overrides }[] = [
        { name: 'Keeps generated defaults without overrides', expected: {} },
        { name: 'Uses language-specific overrides', nested, expected: nested },
        { name: 'Preserves legacy root-level overrides', root, expected: root },
        { name: 'Prefers language-specific overrides over root-level overrides', root, nested, expected: nested },
        { name: 'Honors empty language-specific overrides', root, nested: { args: [], sourceFileMap: {} }, expected: { args: [], sourceFileMap: {} } },
        { name: 'Preserves empty root-level overrides', root: { args: [], sourceFileMap: {} }, expected: { args: [], sourceFileMap: {} } },
        { name: 'Resolves arguments independently of root-level mappings', root, nested: { args: nested.args }, expected: { args: nested.args, sourceFileMap: root.sourceFileMap } },
        { name: 'Resolves mappings independently of root-level arguments', root, nested: { sourceFileMap: nested.sourceFileMap }, expected: { args: root.args, sourceFileMap: nested.sourceFileMap } },
    ];

    let helper: NetCoreDebugHelper;
    let context: DockerDebugContext;
    let originalManager: typeof ext.runtimeManager;
    const appProject = path.resolve('test-project', 'TestApp.csproj');

    setup(async () => {
        // Source tests have a separate ext instance from the activated, bundled extension.
        originalManager = ext.runtimeManager;
        ext.runtimeManager = {
            getCommand: async () => 'docker',
        } as unknown as typeof ext.runtimeManager;
        helper = new NetCoreDebugHelper();
        context = {
            folder: { uri: Uri.file(path.dirname(appProject)), name: 'test-project', index: 0 },
            platform: 'netCore',
            actionContext: await createTestActionContext(),
        };
        // Isolate project discovery and debugger installation; exercise the real launch resolver.
        mock.method(NetCoreTaskHelper, 'inferAppProject', async () => appProject);
        mock.method(NetCoreTaskHelper, 'isWebApp', async () => false);
        mock.method(helper as unknown as { acquireDebuggers(os: PlatformOS): Promise<void> }, 'acquireDebuggers', async () => undefined);
    });

    teardown(() => {
        mock.reset();
        ext.runtimeManager = originalManager;
    });

    for (const platformOS of ['Linux', 'Windows'] as const) {
        for (const testCase of cases) {
            test(`${testCase.name} (${platformOS})`, async () => {
                context.runDefinition = { type: 'docker-run', dockerRun: { os: platformOS } };
                const config: DockerDebugConfiguration = {
                    name: 'Test .NET launch',
                    type: 'docker',
                    request: 'launch',
                    containerName: 'test-container',
                    ...testCase.root,
                    netCore: { appProject, appOutput: 'TestApp.dll', ...testCase.nested },
                };

                const resolved = await helper.resolveDebugConfiguration(context, config);
                assert(resolved);
                assert.strictEqual(resolved.type, 'coreclr');
                assert.strictEqual(resolved.request, 'launch');
                assert.deepStrictEqual(resolved.args, testCase.expected.args ?? [
                    '--additionalProbingPath', platformOS === 'Windows' ? 'C:\\.nuget\\packages' : '/root/.nuget/packages',
                    '--additionalProbingPath', platformOS === 'Windows' ? 'C:\\.nuget\\fallbackpackages' : '/root/.nuget/fallbackpackages',
                    platformOS === 'Windows' ? 'C:\\app\\TestApp.dll' : '/app/TestApp.dll',
                ]);
                assert.deepStrictEqual(resolved.sourceFileMap, testCase.expected.sourceFileMap ?? {
                    '/app/Views': path.join(path.dirname(appProject), 'Views'),
                });
            });
        }
    }
});
