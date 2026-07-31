/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { expect } from 'chai';
import {
    SharedInspectVolumeRecordSchema,
    normalizeInspectVolumeRecord,
} from '../../../clients/DockerClientBase/SharedInspectVolumeRecord';

describe('(unit) normalizeInspectVolumeRecord', () => {
    it('Should map every field when the runtime emits them', () => {
        const record = {
            Name: 'myvol',
            Driver: 'nfs',
            Mountpoint: '/var/lib/docker/volumes/myvol/_data',
            Scope: 'global',
            Labels: { 'com.example.k': 'v' },
            Options: { device: ':/exports' },
            CreatedAt: '2024-06-01T12:00:00Z',
        };

        const raw = JSON.stringify(record);
        const result = normalizeInspectVolumeRecord(SharedInspectVolumeRecordSchema.parse(record), raw);

        expect(result.name).to.equal('myvol');
        expect(result.driver).to.equal('nfs');
        expect(result.mountpoint).to.equal('/var/lib/docker/volumes/myvol/_data');
        expect(result.scope).to.equal('global');
        expect(result.labels).to.deep.equal({ 'com.example.k': 'v' });
        expect(result.options).to.deep.equal({ device: ':/exports' });
        expect(result.createdAt).to.be.a('Date');
        expect(result.raw).to.equal(raw);
    });

    it('Should apply the per-runtime driver/scope fallbacks when omitted (nerdctl)', () => {
        const record = { Name: 'myvol' };

        const result = normalizeInspectVolumeRecord(
            SharedInspectVolumeRecordSchema.parse(record),
            '{}',
            { defaultDriver: 'local', defaultScope: 'local' },
        );

        expect(result.driver).to.equal('local');
        expect(result.scope).to.equal('local');
        expect(result.labels).to.deep.equal({});
        expect(result.options).to.deep.equal({});
    });

    it('Should leave driver/scope empty when omitted and no fallback is configured', () => {
        const record = { Name: 'myvol' };

        const result = normalizeInspectVolumeRecord(SharedInspectVolumeRecordSchema.parse(record), '{}');

        expect(result.driver).to.equal('');
        expect(result.scope).to.equal('');
    });

    it('Should fabricate a creation date when CreatedAt is absent', () => {
        const record = { Name: 'myvol' };

        const result = normalizeInspectVolumeRecord(SharedInspectVolumeRecordSchema.parse(record), '{}');

        expect(result.createdAt).to.be.a('Date');
    });

    it('Should accept a key=value string for Labels', () => {
        const record = { Name: 'myvol', Labels: 'a=1,b=2' };

        const result = normalizeInspectVolumeRecord(SharedInspectVolumeRecordSchema.parse(record), '{}');

        expect(result.labels).to.deep.equal({ a: '1', b: '2' });
    });
});
