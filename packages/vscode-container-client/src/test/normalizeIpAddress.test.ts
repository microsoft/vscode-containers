/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { expect } from 'chai';
import { normalizeIpAddress } from '../clients/DockerClientBase/normalizeIpAddress';

describe('(unit) normalizeIpAddress', () => {
    it('Should not change IPv4 addresses', () => {
        const ip = '192.168.1.1';
        const normalized = normalizeIpAddress(ip);
        expect(normalized).to.equal(ip);
    });

    it('Should remove brackets from IPv6 addresses', () => {
        const ip = '[2001:db8::1]';
        const normalized = normalizeIpAddress(ip);
        expect(normalized).to.equal('2001:db8::1');
    });

    it('Should handle IPv6 addresses without brackets', () => {
        const ip = '2001:db8::1';
        const normalized = normalizeIpAddress(ip);
        expect(normalized).to.equal(ip);
    });

    it('Should return undefined for empty input', () => {
        const ip = '';
        const normalized = normalizeIpAddress(ip);
        expect(normalized).to.be.undefined;
    });

    it('Should return undefined for undefined input', () => {
        const ip = undefined;
        const normalized = normalizeIpAddress(ip);
        expect(normalized).to.be.undefined;
    });
});
