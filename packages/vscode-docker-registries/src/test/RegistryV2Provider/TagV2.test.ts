/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { digest, created } from "./RegistryV2Simulator";
import { TestRegistryV2Provider } from "./TestRegistryV2Provider";
import { TestCancellationToken } from "../TestCancellationToken";
import { TagV2, Manifest } from "../../RegistryV2Provider/TagV2";

describe('(E2E) TagV2', function () {
    let provider: TestRegistryV2Provider;
    let firstTag: TagV2;
    let repositoryIndex: string;
    let expectedManifest: Manifest;

    const token = new TestCancellationToken();

    before('TagV2 Setup', async function () {
        console.log('    TagV2 Setup');

        ({ provider, firstTag } = await TestRegistryV2Provider.setup(10031, 10032, false));
        repositoryIndex = Object.keys(provider.simulator.cache)[0];

        expectedManifest = {
            digest: digest,
            created: created,
        };
    });

    describe('label', function () {
        it('Should equal reference', function () {
            firstTag.label.should.equal(firstTag.reference);
        });
    });

    describe('contextValue', function () {
        it('Should not be undefined', function () {
            firstTag.contextValue.should.not.be.undefined;
        });
    });

    describe('reference', function () {
        it('Should equal the expected value', function () {
            firstTag.reference.should.equal(provider.simulator.cache[repositoryIndex][0].tag);
        });
    });

    describe('description', function () {
        it('Should equal the expected value', function () {
            firstTag.description.should.equal(expectedManifest.created);
        });
    });

    describe('getManifest', function () {
        it('Should equal the expected value', function () {
            return firstTag.getManifest(token).should.eventually.deep.equal(expectedManifest);
        });
    });

    after('TagV2 Cleanup', async function () {
        console.log('    TagV2 Cleanup');
        provider.dispose();

        // Delete is already covered by RepositoryV2.test.ts
    });
});
