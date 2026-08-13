/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { expect } from 'chai';
import {
    SharedListNetworkRecordSchema,
    normalizeListNetworkRecord,
} from '../../../clients/DockerClientBase/SharedListNetworkRecord';

describe('(unit) normalizeListNetworkRecord', () => {
    it('Should normalize boolean strings, labels, and the creation date', () => {
        const parsed = SharedListNetworkRecordSchema.parse({
            ID: 'net123',
            Name: 'bridge',
            Driver: 'bridge',
            Scope: 'local',
            IPv6: 'true',
            Internal: 'false',
            Labels: 'com.example.k=v',
            CreatedAt: '2024-06-01T12:00:00Z',
        });

        const result = normalizeListNetworkRecord(parsed);

        expect(result.id).to.equal('net123');
        expect(result.name).to.equal('bridge');
        expect(result.driver).to.equal('bridge');
        expect(result.scope).to.equal('local');
        expect(result.ipv6).to.equal(true);
        expect(result.internal).to.equal(false);
        expect(result.labels).to.deep.equal({ 'com.example.k': 'v' });
        expect(result.createdAt).to.be.a('Date');
    });

    it('Should default booleans to false and labels to empty when omitted', () => {
        const parsed = SharedListNetworkRecordSchema.parse({
            Name: 'bridge',
        });

        const result = normalizeListNetworkRecord(parsed);

        expect(result.ipv6).to.equal(false);
        expect(result.internal).to.equal(false);
        expect(result.labels).to.deep.equal({});
        expect(result.createdAt).to.be.undefined;
    });

    it('Should fall back to false for an unrecognized boolean string', () => {
        const parsed = SharedListNetworkRecordSchema.parse({
            Name: 'bridge',
            IPv6: '',
            Internal: 'notabool',
        });

        const result = normalizeListNetworkRecord(parsed);

        expect(result.ipv6).to.equal(false);
        expect(result.internal).to.equal(false);
    });
});
