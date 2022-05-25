/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { TestRegistryV2Provider } from "./TestRegistryV2Provider";
import { RegistryV2 } from "../../RegistryV2Provider/RegistryV2";
import { TestCancellationToken } from "../TestCancellationToken";
import { Request } from "node-fetch";
import { RepositoryV2 } from "../../RegistryV2Provider/RepositoryV2";
import { ExtensionContext } from "vscode";

async function getAuthHeaderFromSignedRequest(registry: RegistryV2, scope: string, token: TestCancellationToken): Promise<string> {
    const request = new Request('https://microsoft.com');
    await registry.signRequest(request, scope, token);
    return request.headers.get('authorization') ?? '';
}

describe('(E2E) RegistryV2', function () {
    let provider: TestRegistryV2Provider;
    let firstReg: RegistryV2;

    let initialAuthHeader: string;

    const token = new TestCancellationToken();

    before('RegistryV2 Setup', async function () {
        console.log('    RegistryV2 Setup');
        ({ provider, firstReg } = await TestRegistryV2Provider.setup(10011, 10012, false));
        initialAuthHeader = await getAuthHeaderFromSignedRequest(firstReg, 'registry:catalog:*', token);
    });

    describe('label', function () {
        it('Should equal baseImagePath', function () {
            firstReg.label.should.not.be.undefined;
            firstReg.label.should.equal(firstReg.baseImagePath);
        });
    });

    describe('contextValue', function () {
        it('Should not be undefined', function () {
            firstReg.contextValue.should.not.be.undefined;
        });

        it('Should not contain monolith', function () {
            firstReg.contextValue.toLowerCase().should.not.contain('monolith');
        });
    });

    describe('registryId', function () {
        it('Should not be undefined', function () {
            firstReg.registryId.should.not.be.undefined;
        });
    });

    describe('registryUrl', function () {
        it('Should equal the expected value', function () {
            firstReg.registryUrl.toString().should.equal(provider.simulator.registryUrl.toString());
        });
    });

    describe('baseImagePath', function () {
        it('Should equal the expected value', function () {
            firstReg.baseImagePath.should.equal(provider.simulator.registry);
        });
    });

    describe('getRepositories', function () {
        it('Should have all repositories with correct names', async function () {
            const repositories = await firstReg.getRepositories(true, token);

            repositories.map(r => (r as RepositoryV2).name).should.deep.equal(Object.keys(provider.simulator.cache));
            provider.simulator.catalogCalled.should.be.true;
        });
    });

    describe('getAuthHeader', function () {
        it('Should initially be using basic auth', function () {
            initialAuthHeader.should.equal(`Basic ${Buffer.from(`${provider.credentials.account}:${provider.credentials.secret}`).toString('base64')}`);
        });

        it('Should switch to OAuth automatically if it gets an unauthorized result', async function () {
            provider.simulator.requireOAuth();
            await firstReg.getRepositories(true, token);

            return getAuthHeaderFromSignedRequest(firstReg, 'registry:catalog:*', token).should.eventually.equal('Bearer silly');
        });
    });

    describe('connectMonolithRepository', function () {
        it('Should throw', function () {
            return firstReg.connectMonolithRepository('test').should.eventually.be.rejected;
        });
    });

    describe('disconnectMonolithRepository', function () {
        it('Should throw', function () {
            return firstReg.disconnectMonolithRepository('test').should.eventually.be.rejected;
        });
    });

    describe('connect', function () {
        it('Should return a non-monolith if monolith is false', async function () {
            const reg = await RegistryV2.connect(
                provider,
                'abc123',
                provider.testExtensionContext as unknown as ExtensionContext,
                provider.credentials,
                false
            );

            reg.isMonolith.should.be.false;

            await provider.disconnectRegistry(reg);
        });

        it('Should throw if monolith is false but monolith repositories are given', function () {
            return RegistryV2.connect(provider,
                'abc123',
                provider.testExtensionContext as unknown as ExtensionContext,
                provider.credentials,
                false,
                ['abcd1234']
            ).should.eventually.be.rejected;
        });
    });

    after('RegistryV2 Cleanup', async function () {
        console.log('    RegistryV2 Cleanup');
        provider.dispose();
    });
});

describe('(E2E) Monolith RegistryV2', function () {
    let provider: TestRegistryV2Provider;
    let firstReg: RegistryV2;

    const token = new TestCancellationToken();

    before('Monolith RegistryV2 Setup', async function () {
        console.log('    Monolith RegistryV2 Setup');
        ({ provider, firstReg } = await TestRegistryV2Provider.setup(10016, 10017, true));
    });

    describe('contextValue', function () {
        it('Should not be undefined', function () {
            firstReg.contextValue.should.not.be.undefined;
        });

        it('Should contain monolith', function () {
            firstReg.contextValue.toLowerCase().should.contain('monolith');
        });
    });

    describe('getRepositories', function () {
        it('Should have all repositories with correct names, without calling _catalog', async function () {
            const repositories = await firstReg.getRepositories(true, token);

            repositories.map(r => (r as RepositoryV2).name).should.deep.equal(Object.keys(provider.simulator.cache));
            provider.simulator.catalogCalled.should.be.false;
        });
    });

    describe('connect', function () {
        it('Should return a monolith if monolith repositories given', async function () {
            const reg = await RegistryV2.connect(provider,
                'abc123',
                provider.testExtensionContext as unknown as ExtensionContext,
                provider.credentials,
                true,
                Object.keys(provider.simulator.cache)
            );

            reg.isMonolith.should.be.true;

            await provider.disconnectRegistry(reg);
        });

        it('Should return a monolith even if no monolith repositories given', async function () {
            const reg = await RegistryV2.connect(provider,
                'abc123',
                provider.testExtensionContext as unknown as ExtensionContext,
                provider.credentials,
                true
            );

            reg.isMonolith.should.be.true;

            await provider.disconnectRegistry(reg);
        });
    });

    describe('connectMonolithRepository / disconnectMonolithRepository', function () {
        it('Should add and remove a new monolith repository to the registry', async function () {
            const repositoryName = 'canary';

            await firstReg.connectMonolithRepository(repositoryName);
            let repositories = await firstReg.getRepositories(true, token);
            repositories.map(r => (r as RepositoryV2).name).should.contain(repositoryName);

            await firstReg.disconnectMonolithRepository(repositoryName);
            repositories = await firstReg.getRepositories(true, token);
            repositories.map(r => (r as RepositoryV2).name).should.not.contain(repositoryName);
        });
    });

    after('Monolith RegistryV2 Cleanup', async function () {
        console.log('    Monolith RegistryV2 Cleanup');
        provider.dispose();
    });
});
