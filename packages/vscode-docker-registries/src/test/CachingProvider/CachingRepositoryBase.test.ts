/*!--------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { TestCachingRegistryProvider, TestCachingRepository, testTags, TestCachingTag } from "./TestCachingRegistryProvider";
import { TestCancellationToken } from "../TestCancellationToken";

describe('(Unit) CachingRegistryProviderBase', function () {
    let firstRepo: TestCachingRepository;
    const token = new TestCancellationToken();

    before('CachingRegistryProviderBase Setup', async function () {
        console.log('    CachingRegistryProviderBase Setup');
        ({ firstRepo } = await TestCachingRegistryProvider.setup());
    });

    describe('getTags', function () {
        it('Should have all tags with correct label', async function () {
            const tags = await firstRepo.getTags(true, token);

            tags.map(t => t.label).should.deep.equal(testTags);
        });

        it('Should return a new tag object every time when not caching', async function () {
            const tagA = (await firstRepo.getTags(true, token))[0] as TestCachingTag;
            tagA.canary = true;

            const tagB = (await firstRepo.getTags(true, token))[0] as TestCachingTag;

            tagA.canary.should.be.true;
            tagB.canary.should.be.false;
            tagA.should.not.deep.equal(tagB);
        });

        it('Should return the same object every time when caching', async function () {
            const tagA = (await firstRepo.getTags(true, token))[0] as TestCachingTag;
            tagA.canary = true;

            const tagB = (await firstRepo.getTags(false, token))[0] as TestCachingTag;

            tagA.canary.should.be.true;
            tagB.canary.should.be.true;
            tagA.should.deep.equal(tagB);
        });

        it('Should fill the cache if it is undefined', async function () {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (firstRepo as any).cache = undefined;

            return firstRepo.getTags(false, token).should.eventually.not.be.undefined;
        });
    });
});
