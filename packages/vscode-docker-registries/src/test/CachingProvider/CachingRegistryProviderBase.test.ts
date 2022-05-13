/*!--------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { TestCancellationToken } from '../TestCancellationToken';
import { TestCachingRegistryProvider, testLabel, TestCachingRegistry } from "./TestCachingRegistryProvider";
import { expect } from 'chai';

describe('(Unit) CachingRegistryProviderBase', function () {
    let provider: TestCachingRegistryProvider;
    const token = new TestCancellationToken();

    before('CachingRegistryProviderBase Setup', async function () {
        console.log('    CachingRegistryProviderBase Setup');
        ({ provider } = await TestCachingRegistryProvider.setup());
    });

    describe('getRegistries', function () {
        it('Should return one registry with the expected label', async function () {
            const registries = await provider.getRegistries(true, token);
            registries.should.have.lengthOf(1);
            registries[0].label.should.equal(testLabel);
        });

        it('Should return a new registry object every time when not caching', async function () {
            const regA = (await provider.getRegistries(true, token))[0] as TestCachingRegistry;
            regA.canary = true;

            const regB = (await provider.getRegistries(true, token))[0] as TestCachingRegistry;

            regA.canary.should.be.true;
            regB.canary.should.be.false;
            regA.should.not.deep.equal(regB);
        });

        it('Should return the same object every time when caching', async function () {
            const regA = (await provider.getRegistries(true, token))[0] as TestCachingRegistry;
            regA.canary = true;

            const regB = (await provider.getRegistries(false, token))[0] as TestCachingRegistry;

            regA.canary.should.be.true;
            regB.canary.should.be.true;
            regA.should.deep.equal(regB);
        });

        it('Should fill the cache if it is undefined', async function () {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (provider as any).cache = undefined;

            return provider.getRegistries(false, token).should.eventually.not.be.undefined;
        });
    });

    describe('connectRegistry / disconnectRegistry', function () {
        it('Should put the new registry into the cache, and remove it upon disconnect', async function () {
            const regA = await provider.connectRegistry(token) as TestCachingRegistry;

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (provider as any).cache.should.include(regA);

            await provider.disconnectRegistry(regA);

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (provider as any).cache.should.not.include(regA);
        });

        it('Should not alter the cache if it is undefined', async function () {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (provider as any).cache = undefined;

            const regA = await provider.connectRegistry(token) as TestCachingRegistry;

            expect(regA).to.not.be.undefined;
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            expect((provider as any).cache).to.be.undefined;

            await provider.disconnectRegistry(regA);

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            expect((provider as any).cache).to.be.undefined;
        });
    });

    after('CachingRegistryProviderBase Cleanup', async function () {
        console.log('    CachingRegistryProviderBase Cleanup');

        // Validate that everything is cleaned up
        await provider.disconnectRegistry((await provider.getRegistries(true, token))[0] as TestCachingRegistry);
        Object.keys(provider.testExtensionContext.globalState.cache).should.be.empty;
    });
});
