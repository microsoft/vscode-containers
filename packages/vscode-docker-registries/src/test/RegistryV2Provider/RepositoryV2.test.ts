/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { TestRegistryV2Provider } from "./TestRegistryV2Provider";
import { TestCancellationToken } from "../TestCancellationToken";
import { RepositoryV2 } from "../../RegistryV2Provider/RepositoryV2";
import { TagV2 } from "../../RegistryV2Provider/TagV2";

describe('(E2E) RepositoryV2', function () {
    let provider: TestRegistryV2Provider;
    let firstRepo: RepositoryV2;
    let repositoryIndex: string;

    const token = new TestCancellationToken();

    before('RepositoryV2 Setup', async function () {
        console.log('    RepositoryV2 Setup');
        ({ provider, firstRepo } = await TestRegistryV2Provider.setup(10021, 10022, false));
        repositoryIndex = Object.keys(provider.simulator.cache)[0];
    });

    describe('label', function () {
        it('Should equal name', function () {
            firstRepo.label.should.equal(firstRepo.name);
        });
    });

    describe('contextValue', function () {
        it('Should not be undefined', function () {
            firstRepo.contextValue.should.not.be.undefined;
        });

        it('Should not contain monolith', function () {
            firstRepo.contextValue.toLowerCase().should.not.contain('monolith');
        });
    });

    describe('name', function () {
        it('Should equal the expected value', function () {
            firstRepo.name.should.equal(repositoryIndex);
        });
    });

    describe('getTags', function () {
        it('Should have all tags with correct names', async function () {
            const tags = (await firstRepo.getTags(true, token)) as TagV2[];

            tags.map(t => t.reference).should.deep.equal(provider.simulator.cache[repositoryIndex].map(t => t.tag));
        });
    });

    after('RepositoryV2 Cleanup', async function () {
        console.log('    RepositoryV2 Cleanup');

        // Validate that delete works as expected
        await firstRepo.delete(token);
        provider.simulator.cache[repositoryIndex].should.be.empty;

        provider.dispose();
    });
});

describe('(E2E) Monolith RepositoryV2', function () {
    let provider: TestRegistryV2Provider;
    let firstRepo: RepositoryV2;
    let repositoryIndex: string;

    const token = new TestCancellationToken();

    before('Monolith RepositoryV2 Setup', async function () {
        console.log('    Monolith RepositoryV2 Setup');
        ({ provider, firstRepo } = await TestRegistryV2Provider.setup(10026, 10027, true));
        repositoryIndex = Object.keys(provider.simulator.cache)[0];
    });

    describe('contextValue', function () {
        it('Should not be undefined', function () {
            firstRepo.contextValue.should.not.be.undefined;
        });

        it('Should contain monolith', function () {
            firstRepo.contextValue.toLowerCase().should.contain('monolith');
        });
    });

    after('Monolith RepositoryV2 Cleanup', async function () {
        console.log('    Monolith RepositoryV2 Cleanup');

        // Validate that delete works as expected
        await firstRepo.delete(token);
        provider.simulator.cache[repositoryIndex].should.be.empty;

        provider.dispose();
    });
});
