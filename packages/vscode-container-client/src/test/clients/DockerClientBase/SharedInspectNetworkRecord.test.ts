/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { expect } from 'chai';
import {
    SharedInspectNetworkRecordSchema,
    normalizeInspectNetworkRecord,
} from '../../../clients/DockerClientBase/SharedInspectNetworkRecord';

describe('(unit) normalizeInspectNetworkRecord', () => {
    it('Should normalize a full Docker-style network inspect record', () => {
        const record = {
            Name: 'mynet',
            Id: 'net123',
            Driver: 'bridge',
            Created: '2024-06-01T12:00:00Z',
            Scope: 'local',
            Internal: false,
            EnableIPv6: true,
            Attachable: true,
            Ingress: false,
            Labels: { 'com.example.k': 'v' },
            IPAM: {
                Driver: 'default',
                Config: [
                    { Subnet: '172.20.0.0/16', Gateway: '172.20.0.1' },
                ],
            },
        };

        const raw = JSON.stringify(record);
        const result = normalizeInspectNetworkRecord(SharedInspectNetworkRecordSchema.parse(record), raw);

        expect(result.name).to.equal('mynet');
        expect(result.id).to.equal('net123');
        expect(result.driver).to.equal('bridge');
        expect(result.createdAt).to.be.a('Date');
        expect(result.scope).to.equal('local');
        expect(result.internal).to.equal(false);
        expect(result.ipv6).to.equal(true);
        expect(result.attachable).to.equal(true);
        expect(result.ingress).to.equal(false);
        expect(result.labels).to.deep.equal({ 'com.example.k': 'v' });
        expect(result.ipam).to.deep.equal({
            driver: 'default',
            config: [{ subnet: '172.20.0.0/16', gateway: '172.20.0.1' }],
        });
        expect(result.raw).to.equal(raw);
    });

    it('Should drop IPAM config entries that have neither subnet nor gateway', () => {
        const record = {
            Name: 'mynet',
            IPAM: {
                Config: [
                    { Subnet: '172.20.0.0/16' },
                    {},
                ],
            },
        };

        const result = normalizeInspectNetworkRecord(SharedInspectNetworkRecordSchema.parse(record), '{}');

        expect(result.ipam?.config).to.deep.equal([{ subnet: '172.20.0.0/16', gateway: '' }]);
    });

    it('Should default the IPAM driver to "default" when omitted', () => {
        const record = {
            Name: 'mynet',
            IPAM: { Config: [] },
        };

        const result = normalizeInspectNetworkRecord(SharedInspectNetworkRecordSchema.parse(record), '{}');

        expect(result.ipam).to.deep.equal({ driver: 'default', config: [] });
    });

    it('Should omit IPAM entirely when the record has none', () => {
        const record = { Name: 'mynet' };

        const result = normalizeInspectNetworkRecord(SharedInspectNetworkRecordSchema.parse(record), '{}');

        expect(result.ipam).to.be.undefined;
        expect(result.labels).to.deep.equal({});
    });
});
