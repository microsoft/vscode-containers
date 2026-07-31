/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { expect } from 'chai';
import {
    SharedListVolumeRecordSchema,
    normalizeListVolumeRecord,
} from '../../../clients/DockerClientBase/SharedListVolumeRecord';

describe('(unit) normalizeListVolumeRecord', () => {
    it('Should map every field when the runtime emits them', () => {
        const parsed = SharedListVolumeRecordSchema.parse({
            Name: 'myvol',
            Driver: 'nfs',
            Mountpoint: '/var/lib/docker/volumes/myvol/_data',
            Scope: 'global',
            Labels: 'com.example.k=v,com.example.k2=v2',
            CreatedAt: '2024-06-01T12:00:00Z',
            Size: '1MB',
        });

        const result = normalizeListVolumeRecord(parsed);

        expect(result.name).to.equal('myvol');
        expect(result.driver).to.equal('nfs');
        expect(result.mountpoint).to.equal('/var/lib/docker/volumes/myvol/_data');
        expect(result.scope).to.equal('global');
        expect(result.labels).to.deep.equal({ 'com.example.k': 'v', 'com.example.k2': 'v2' });
        expect(result.createdAt).to.be.a('Date');
        expect(result.size).to.equal(1_048_576);
    });

    it('Should fall back to local driver/scope and empty labels/mountpoint when omitted', () => {
        const parsed = SharedListVolumeRecordSchema.parse({
            Name: 'myvol',
        });

        const result = normalizeListVolumeRecord(parsed);

        expect(result.driver).to.equal('local');
        expect(result.scope).to.equal('local');
        expect(result.mountpoint).to.equal('');
        expect(result.labels).to.deep.equal({});
        expect(result.createdAt).to.be.undefined;
        expect(result.size).to.be.undefined;
    });

    it('Should accept an already-parsed record for Labels', () => {
        const parsed = SharedListVolumeRecordSchema.parse({
            Name: 'myvol',
            Labels: { a: '1' },
        });

        const result = normalizeListVolumeRecord(parsed);

        expect(result.labels).to.deep.equal({ a: '1' });
    });
});
