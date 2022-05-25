/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { TestCancellationToken } from '../TestCancellationToken';
import { TestCachingRegistryProvider, testLabel, TestCachingRegistry, TestCachingRepository, credentials } from "./TestCachingRegistryProvider";

describe('(Unit) CachingRegistryBase', function () {
    let provider: TestCachingRegistryProvider;
    let firstReg: TestCachingRegistry;
    const token = new TestCancellationToken();

    before('CachingRegistryBase Setup', async function () {
        console.log('    CachingRegistryBase Setup');
        ({ provider, firstReg } = await TestCachingRegistryProvider.setup());
    });

    describe('getRepositories', function () {
        it('Should return one repository with the expected label', async function () {
            const repositories = await firstReg.getRepositories(true, token);
            repositories.should.have.lengthOf(1);
            repositories[0].label.should.equal(testLabel);
        });

        it('Should return a new repository object every time when not caching', async function () {
            const repA = (await firstReg.getRepositories(true, token))[0] as TestCachingRepository;
            repA.canary = true;

            const repB = (await firstReg.getRepositories(true, token))[0] as TestCachingRepository;

            repA.canary.should.be.true;
            repB.canary.should.be.false;
            repA.should.not.deep.equal(repB);
        });

        it('Should return the same object every time when caching', async function () {
            const repA = (await firstReg.getRepositories(true, token))[0] as TestCachingRepository;
            repA.canary = true;

            const repB = (await firstReg.getRepositories(false, token))[0] as TestCachingRepository;

            repA.canary.should.be.true;
            repB.canary.should.be.true;
            repA.should.deep.equal(repB);
        });

        it('Should fill the cache if it is undefined', async function () {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (firstReg as any).cache = undefined;

            return firstReg.getRepositories(false, token).should.eventually.not.be.undefined;
        });
    });

    describe('getDockerCredentials', function () {
        it('Should equal what was previously set', async function () {
            const creds = await firstReg.getDockerLoginCredentials(token);
            creds.should.deep.equal(credentials);
        });

        it('Should be using VSCode for storage', function () {
            Object.keys(provider.testExtensionContext.secrets.cache).should.have.lengthOf(1);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            provider.testExtensionContext.secrets.cache[(firstReg as any).secretStoreKey].should.equal(credentials.secret);
        });
    });

    after('CachingRegistryBase Cleanup', async function () {
        console.log('    CachingRegistryBase Cleanup');

        // Validate that everything is cleaned up
        await provider.disconnectRegistry(firstReg);
        Object.keys(provider.testExtensionContext.globalState.cache).should.be.empty;
        Object.keys(provider.testExtensionContext.secrets.cache).should.be.empty;
    });
});
