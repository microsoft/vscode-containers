/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { TestCancellationToken } from "../TestCancellationToken";
import { TestRegistryV2Provider } from "./TestRegistryV2Provider";
import { RegistryV2 } from "../../RegistryV2Provider/RegistryV2";

describe('(E2E) RegistryV2Provider', function () {
    let provider: TestRegistryV2Provider;

    const token = new TestCancellationToken();

    before('RegistryV2Provider Setup', async function () {
        console.log('    RegistryV2Provider Setup');
        ({ provider } = await TestRegistryV2Provider.setup(10001, 10002, false));
    });

    describe('label', function () {
        it('Should not be undefined', function () {
            provider.label.should.not.be.undefined;
        });
    });

    describe('contextValue', function () {
        it('Should not be undefined', function () {
            provider.contextValue.should.not.be.undefined;
        });
    });

    describe('providerId', function () {
        it('Should not be undefined', function () {
            provider.providerId.should.not.be.undefined;
        });
    });

    describe('getRegistries', function () {
        it('Should return one registry with the expected URL', async function () {
            const registries = await provider.getRegistries(true, token);
            registries.should.have.lengthOf(1);
            (registries[0] as RegistryV2).registryUrl.toString().should.equal(provider.simulator.registryUrl.toString());
        });
    });

    after('RegistryV2Provider Cleanup', function () {
        console.log('    RegistryV2Provider Cleanup');
        provider.dispose();
    });
});
