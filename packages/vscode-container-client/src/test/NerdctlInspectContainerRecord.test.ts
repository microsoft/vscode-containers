/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { expect } from 'chai';
import {
    SharedInspectContainerRecordSchema,
    normalizeInspectContainerRecord,
} from '../clients/DockerClientBase/SharedInspectContainerRecord';

describe('(unit) SharedInspectContainerRecordSchema mounts', () => {
    const baseRecord = {
        Id: 'abc123',
        Name: '/my-container',
        Image: 'alpine:latest',
        Created: '2026-01-10T23:38:26.737324778Z',
    };

    it('Should not drop the whole container when an unrecognized mount type is present', () => {
        const raw = JSON.stringify({
            ...baseRecord,
            Mounts: [
                { Type: 'bind', Source: '/host/path', Destination: '/container/path', RW: true },
                { Type: 'tmpfs', Destination: '/tmp', RW: true },
                { Type: 'volume', Name: 'myvol', Source: '/var/lib/vol', Destination: '/data', RW: true },
            ],
        });

        const parsed = SharedInspectContainerRecordSchema.parse(JSON.parse(raw));
        const normalized = normalizeInspectContainerRecord(parsed, raw, { defaultVolumeDriver: 'local' });

        // The tmpfs mount is skipped, but bind + volume survive (container is not dropped).
        expect(normalized.mounts).to.have.lengthOf(2);
        expect(normalized.mounts.map((m) => m.type)).to.deep.equal(['bind', 'volume']);
    });

    it('Should parse a container with only unrecognized mount types without throwing', () => {
        const raw = JSON.stringify({
            ...baseRecord,
            Mounts: [
                { Type: 'tmpfs', Destination: '/tmp' },
                { Type: 'npipe', Source: '\\\\.\\pipe\\x', Destination: '\\\\.\\pipe\\y' },
            ],
        });

        const parsed = SharedInspectContainerRecordSchema.parse(JSON.parse(raw));
        const normalized = normalizeInspectContainerRecord(parsed, raw, { defaultVolumeDriver: 'local' });

        expect(normalized.mounts).to.deep.equal([]);
    });
});

describe('(unit) SharedInspectContainerRecordSchema timestamps', () => {
    const baseRecord = {
        Id: 'abc123',
        Name: '/my-container',
        Image: 'alpine:latest',
    };

    it('Should include startedAt/finishedAt when they are at or after a valid Created', () => {
        const raw = JSON.stringify({
            ...baseRecord,
            Created: '2026-01-10T00:00:00Z',
            State: {
                StartedAt: '2026-01-10T00:00:05Z',
                FinishedAt: '2026-01-10T00:00:10Z',
            },
        });

        const parsed = SharedInspectContainerRecordSchema.parse(JSON.parse(raw));
        const normalized = normalizeInspectContainerRecord(parsed, raw, { defaultVolumeDriver: 'local' });

        expect(normalized.startedAt).to.be.a('Date');
        expect(normalized.finishedAt).to.be.a('Date');
    });

    it('Should exclude startedAt/finishedAt that are before a valid Created', () => {
        const raw = JSON.stringify({
            ...baseRecord,
            Created: '2026-01-10T00:00:10Z',
            State: {
                StartedAt: '2026-01-10T00:00:00Z',
                FinishedAt: '2026-01-10T00:00:05Z',
            },
        });

        const parsed = SharedInspectContainerRecordSchema.parse(JSON.parse(raw));
        const normalized = normalizeInspectContainerRecord(parsed, raw, { defaultVolumeDriver: 'local' });

        expect(normalized.startedAt).to.be.undefined;
        expect(normalized.finishedAt).to.be.undefined;
    });

    it('Should not include startedAt/finishedAt from before now when Created is invalid', () => {
        // An invalid Created falls back to "now"; started/finished timestamps from
        // the past must be compared against that same baseline and excluded.
        const raw = JSON.stringify({
            ...baseRecord,
            Created: '',
            State: {
                StartedAt: '2000-01-01T00:00:00Z',
                FinishedAt: '2000-01-01T00:00:05Z',
            },
        });

        const parsed = SharedInspectContainerRecordSchema.parse(JSON.parse(raw));
        const normalized = normalizeInspectContainerRecord(parsed, raw, { defaultVolumeDriver: 'local' });

        expect(normalized.createdAt).to.be.a('Date');
        expect(normalized.startedAt).to.be.undefined;
        expect(normalized.finishedAt).to.be.undefined;
    });
});

