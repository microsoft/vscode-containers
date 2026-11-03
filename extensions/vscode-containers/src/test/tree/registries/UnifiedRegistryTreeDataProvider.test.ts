/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ext } from '../../../extensionVariables';
import { UnifiedRegistryItem, UnifiedRegistryTreeDataProvider } from '../../../tree/registries/UnifiedRegistryTreeDataProvider';
import { TestMemento } from '../../TestMemento';

class TestRegistryTreeDataProvider extends UnifiedRegistryTreeDataProvider {
    public readonly roots = ['Azure', 'Docker Hub', 'GitHub', 'Generic Registry'].map(label => ({
        provider: undefined,
        wrappedItem: { label },
        parent: undefined,
    }));
    public readonly visited: UnifiedRegistryItem<unknown>[] = [];

    public override async getChildren(element?: UnifiedRegistryItem<unknown>): Promise<UnifiedRegistryItem<unknown>[]> {
        if (!element) {
            return this.roots;
        }

        this.visited.push(element);
        return [];
    }
}

suite('(unit) UnifiedRegistryTreeDataProvider.getConnectedRegistries', () => {
    let originalAzureProvider: typeof ext.azureRegistryDataProvider;
    let originalDockerHubProvider: typeof ext.dockerHubRegistryDataProvider;
    let originalGitHubProvider: typeof ext.githubRegistryDataProvider;

    setup(() => {
        originalAzureProvider = ext.azureRegistryDataProvider;
        originalDockerHubProvider = ext.dockerHubRegistryDataProvider;
        originalGitHubProvider = ext.githubRegistryDataProvider;
        ext.azureRegistryDataProvider = { label: 'Azure' } as typeof ext.azureRegistryDataProvider;
        ext.dockerHubRegistryDataProvider = { label: 'Docker Hub' } as typeof ext.dockerHubRegistryDataProvider;
        ext.githubRegistryDataProvider = { label: 'GitHub' } as typeof ext.githubRegistryDataProvider;
    });

    teardown(() => {
        ext.azureRegistryDataProvider = originalAzureProvider;
        ext.dockerHubRegistryDataProvider = originalDockerHubProvider;
        ext.githubRegistryDataProvider = originalGitHubProvider;
    });

    const cases = [
        { host: 'registry.azurecr.io', expected: 'Azure' },
        { host: 'subdomain.registry.azurecr.io', expected: 'Azure' },
        { host: 'evilazurecr.io', expected: 'Generic Registry' },
        { host: 'azurecr.io', expected: 'Generic Registry' },
        { host: 'registry.azurecr.io.evil.example', expected: 'Generic Registry' },
        { host: 'docker.io', expected: 'Docker Hub' },
        { host: 'ghcr.io', expected: 'GitHub' },
        { host: 'registry.example.com', expected: 'Generic Registry' },
    ];

    for (const testCase of cases) {
        test(`Selects ${testCase.expected} for ${testCase.host}`, async () => {
            const provider = new TestRegistryTreeDataProvider(new TestMemento());
            await provider.getConnectedRegistries(testCase.host);

            assert.deepStrictEqual(provider.visited, provider.roots.filter(root => root.wrappedItem.label === testCase.expected));
        });
    }

    test('Searches all providers when no host is specified', async () => {
        const provider = new TestRegistryTreeDataProvider(new TestMemento());
        await provider.getConnectedRegistries();

        assert.deepStrictEqual(provider.visited, provider.roots);
    });
});
